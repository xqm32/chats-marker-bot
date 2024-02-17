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
			let usernames = new Set<string>();

			const forwardOrigin = ctx.message.forward_origin;
			if (forwardOrigin?.type === 'channel') usernames.add(`@${forwardOrigin.chat.username}`);

			for (const entity of ctx.message.entities ?? []) {
				const content = ctx.message.text!.slice(entity.offset, entity.offset + entity.length);
				switch (entity.type) {
					case 'mention':
						usernames.add(content);
						break;
					case 'url':
					case 'text_link':
						let url = entity.type === 'text_link' ? new URL(entity.url) : new URL(content);
						if (url.hostname === 't.me') {
							const [_, username] = url.pathname.split('/');
							if (username.startsWith('+')) continue;
							usernames.add(`@${username}`);
						}
						break;
				}
			}

			const promises = Array.from(usernames).map((username) =>
				(async () => {
					try {
						const chat = await ctx.api.getChat(username);
						if (chat.type !== 'channel') return `@${username}`;
						return `${username} ${chat.title}`;
					} catch (err: any) {
						return `${username} ${err.message}`;
					}
				})()
			);
			const titles = await Promise.all(promises);
			await ctx.reply(titles.join('\n'));
		});

		return await webhookCallback(bot, 'cloudflare-mod')(request);
	},
};
