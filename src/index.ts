import { Bot, Context, NextFunction, webhookCallback } from 'grammy';

interface Env {
	BOT_TOKEN: string;
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
			let usernames = new Array<string>();

			const forwardOrigin = ctx.message.forward_origin;
			if (forwardOrigin?.type === 'channel' && forwardOrigin.chat.username !== undefined) {
				usernames.push(`@${forwardOrigin.chat.username}`);
			}

			for (const entity of ctx.message.entities ?? []) {
				const content = ctx.message.text!.slice(entity.offset, entity.offset + entity.length);
				switch (entity.type) {
					case 'mention':
						if (content.endsWith('bot')) continue;
						usernames.push(content);
						break;
					case 'url':
					case 'text_link':
						let url = entity.type === 'text_link' ? new URL(entity.url) : new URL(content);
						if (url.hostname === 't.me') {
							const [_, username] = url.pathname.split('/');
							if (username.startsWith('+')) continue;
							else if (username.endsWith('bot')) continue;
							usernames.push(`@${username}`);
						}
						break;
				}
			}

			usernames = Array.from(new Set(usernames));
			const promises = usernames.map((username) =>
				(async () => {
					try {
						const chat = await ctx.api.getChat(username);
						switch (chat.type) {
							case 'group':
							case 'supergroup':
							case 'channel':
								return `${username} ${chat.title}`;
							default:
								return `${username}`;
						}
					} catch (err: any) {
						return `${username} ${err.message}`;
					}
				})()
			);
			const titles = await Promise.all(promises);
			if (titles.length === 0) {
				await ctx.react('🤔');
				return;
			}
			await ctx.reply(titles.join('\n'));
		});

		return await webhookCallback(bot, 'cloudflare-mod')(request);
	},
};
