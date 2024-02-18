import { Bot, Context, NextFunction, webhookCallback } from 'grammy';

interface Env {
	BOT_TOKEN: string;
}

interface Chat {
	url: string;
	title: string;
}

async function resolveWithAPI<C extends Context>(ctx: C, url: string): Promise<Chat> {
	if (url.startsWith('https://t.me/')) url = `@${url.slice(13)}`;
	else if (!url.startsWith('@')) throw Error(`${url} is invalid`);
	if (url.includes('/')) url = url.split('/')[0];

	const chat = await ctx.api.getChat(url);
	switch (chat.type) {
		case 'channel':
		case 'group':
		case 'supergroup':
			return { url, title: chat.title };
		default:
			throw Error(`${url} is not a channel or group`);
	}
}

async function replyError(ctx: Context, next: NextFunction): Promise<void> {
	try {
		await next();
	} catch (err: any) {
		await ctx.reply(err.message);
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const bot = new Bot(env.BOT_TOKEN);

		bot.use(replyError);
		bot.on('message', async (ctx) => {
			let urls = new Array<string>();

			const forwardOrigin = ctx.message.forward_origin;
			if (forwardOrigin?.type === 'channel' && forwardOrigin.chat.username) {
				urls.push(`@${forwardOrigin.chat.username}`);
			}

			for (const entity of ctx.message.entities ?? []) {
				const text = ctx.message.text!.slice(entity.offset, entity.offset + entity.length);
				switch (entity.type) {
					case 'mention':
					case 'url':
						urls.push(text);
						break;
					case 'text_link':
						urls.push(entity.url);
						break;
				}
			}

			let titles = new Array<string>();
			let errors = new Array<string>();
			await Promise.all(
				Array.from(new Set(urls)).map(async (url) => {
					try {
						const chat = await resolveWithAPI(ctx, url);
						titles.push(`${chat.url} ${chat.title}`);
					} catch (err: any) {
						errors.push(err.message as string);
					}
				})
			);

			if (titles.length === 0) {
				await ctx.react('🤔');
				return;
			}
			await ctx.reply(titles.join('\n'));
			if (errors.length > 0) {
				await ctx.reply(errors.join('\n'));
			}
		});

		return await webhookCallback(bot, 'cloudflare-mod')(request);
	},
};
