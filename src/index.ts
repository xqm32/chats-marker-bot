import { Bot, Context, Filter, NextFunction, webhookCallback } from 'grammy';

interface Env {
	BOT_TOKEN: string;
}

interface Chat {
	url: string;
	title: string;
}

async function resolveWithContext<C extends Context>(url: string, ctx: C): Promise<Chat> {
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
	if (!url.startsWith('https://t.me/')) throw Error(`${url} is not a valid Telegram link`);
	if (ctx) return await resolveWithContext(`@${url.slice(13)}`, ctx);

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

type ContextMessage = Filter<Context, 'message'>['message'];
type ReplyMessage = ContextMessage['reply_to_message'];
type Message = NonNullable<ContextMessage | ReplyMessage>;
function collectUrls(message: Message): string[] {
	let urls = new Array<string>();

	const forwardOrigin = message.forward_origin;
	if (forwardOrigin?.type === 'channel' && forwardOrigin.chat.username) {
		urls.push(`@${forwardOrigin.chat.username}`);
	}

	const messageText = message.text;
	if (messageText !== undefined) {
		message.entities?.forEach((entity) => {
			const text = messageText.slice(entity.offset, entity.offset + entity.length);
			switch (entity.type) {
				case 'mention':
				case 'url':
					urls.push(text);
					break;
				case 'text_link':
					urls.push(entity.url);
					break;
			}
		});
	}

	return Array.from(new Set(urls))
		.filter((url) => url.startsWith('@') || url.startsWith('https://t.me/'))
		.map((url) => (url.startsWith('@') ? `https://t.me/${url.slice(1)}` : url))
		.sort();
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const bot = new Bot(env.BOT_TOKEN);

		bot.use(replyError);
		bot.command('collect', async (ctx) => {
			const replyMessage = ctx.message?.reply_to_message;
			if (replyMessage === undefined) {
				await ctx.react('🤨');
				return;
			}
			await ctx.reply(collectUrls(replyMessage).join('\n'));
		});
		bot.command('resolve', async (ctx) => {
			const replyMessage = ctx.message?.reply_to_message;
			if (replyMessage === undefined) {
				await ctx.react('🤨');
				return;
			}

			let urls = collectUrls(replyMessage);
			let more = new Array<string>();
			if (urls.length > 30) {
				more = urls.slice(30);
				urls = urls.slice(0, 30);
				await ctx.react('🤯');
			}

			let chats = new Array<string>();
			let errors = new Array<string>();
			const settled = await Promise.allSettled(urls.map((url) => resolve(url)));
			for (const result of settled) {
				if (result.status === 'fulfilled') {
					const chat = result.value;
					const parts = chat.url.slice(13).split('/');
					if (parts.length == 1 && !parts[0].startsWith('+')) {
						chats.push(`@${parts[0]} ${chat.title}`);
					} else {
						chats.push(`<a href="${chat.url}">${chat.title}</a>`);
					}
				} else {
					errors.push(result.reason.message);
				}
			}

			if (errors.length > 0) await ctx.reply(errors.join('\n'));
			if (chats.length > 0) await ctx.api.sendMessage(ctx.chat.id, chats.join('\n'), { parse_mode: 'HTML' });
			else await ctx.react('🤔');
			if (more.length > 0) await ctx.reply(more.join('\n'));
		});
		bot.on('message', async (ctx) => {
			await ctx.react('🥰');
		});

		return await webhookCallback(bot, 'cloudflare-mod')(request);
	},
};
