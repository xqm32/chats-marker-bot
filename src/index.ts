import { Bot, Context, NextFunction, webhookCallback } from 'grammy';

interface Env {
	BOT_TOKEN: string;
}

interface Chat {
	url: string;
	title: string;
}

async function resolveWithContext<C extends Context>(url: string, ctx: C): Promise<Chat> {
	if (url.startsWith('https://t.me/')) url = `@${url.slice(13)}`;
	else if (!url.startsWith('@')) throw Error(`${url} is invalid`);
	if (url.includes('/')) url = url.split('/')[0];

	const chat = await ctx.api.getChat(url);
	switch (chat.type) {
		case 'channel':
		case 'group':
		case 'supergroup':
			return { url: `https://t.me/${url.slice(1)}`, title: chat.title };
		default:
			throw Error(`${url} is not a channel or group`);
	}
}

async function resolve<C extends Context>(url: string, ctx?: C): Promise<Chat> {
	if (ctx) return await resolveWithContext(url, ctx);
	if (!url.startsWith('https://t.me/') && !url.startsWith('@')) throw Error(`${url} is invalid`);
	if (url.startsWith('@')) url = `https://t.me/${url.slice(1)}`;

	const text = await (await fetch(url)).text();
	const matches = [...text.matchAll(/property="og:title" content="(.*)"/g)];
	if (matches.length === 0) throw Error('${url} has no title');
	return { url, title: matches[0][1] };
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

			let more = new Array<string>();
			urls = Array.from(new Set(urls)).sort();
			if (urls.length > 30) {
				more = urls.slice(30);
				urls = urls.slice(0, 30);
				await ctx.react('🤯');
			}

			let titles = new Array<string>();
			let errors = new Array<string>();
			await Promise.all(
				urls.map(async (url) => {
					try {
						const chat = await resolve(url);
						const parts = chat.url.slice(13).split('/');
						if (parts.length == 1 && !parts[0].startsWith('+')) {
							titles.push(`@${parts[0]} ${chat.title}`);
						} else {
							titles.push(`<a href="${chat.url}">${chat.title}</a>`);
						}
					} catch (err: any) {
						errors.push(err.message as string);
					}
				})
			);

			if (errors.length > 0) await ctx.reply(errors.join('\n'));
			if (titles.length > 0) await ctx.api.sendMessage(ctx.chat.id, titles.join('\n'), { parse_mode: 'HTML' });
			else await ctx.react('🤔');
			if (more.length > 0) await ctx.reply(more.join('\n'));
		});

		return await webhookCallback(bot, 'cloudflare-mod')(request);
	},
};
