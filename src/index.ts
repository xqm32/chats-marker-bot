import { Bot, Context, NextFunction, webhookCallback } from 'grammy';

interface Env {
	BOT_TOKEN: string;
}

interface Skip {
	reason: string;
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
			let names = new Array<string | Skip>();

			const forwardOrigin = ctx.message.forward_origin;
			if (forwardOrigin?.type === 'channel') {
				if (forwardOrigin.chat.username === undefined) {
					names.push({ reason: `forward origin channel ${forwardOrigin.chat.title} has no username` });
				} else {
					names.push(`@${forwardOrigin.chat.username}`);
				}
			}

			for (const entity of ctx.message.entities ?? []) {
				const content = ctx.message.text!.slice(entity.offset, entity.offset + entity.length);
				switch (entity.type) {
					case 'mention':
						if (content.toLowerCase().endsWith('bot')) {
							names.push({ reason: `${content} is a bot` });
							continue;
						}
						names.push(content);
						break;
					case 'url':
					case 'text_link':
						let url;
						try {
							url = entity.type === 'text_link' ? new URL(entity.url) : new URL(content);
						} catch (err: any) {
							names.push({ reason: `${content} ${err.message}` });
							continue;
						}
						if (url.hostname === 't.me') {
							const [_, username] = url.pathname.split('/');
							if (username.startsWith('+')) {
								names.push({ reason: `@${content} is private` });
								continue;
							} else if (username.toLowerCase().endsWith('bot')) {
								names.push({ reason: `@${username} is a bot` });
								continue;
							}
							names.push(`@${username}`);
						}
						break;
				}
			}

			names = Array.from(new Set(names)).sort();
			const usernames = names.filter((username): username is string => typeof username === 'string');
			const skipUsernames = names.filter((username): username is Skip => typeof username !== 'string');

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
								return { reason: `${username} is private` };
						}
					} catch (err: any) {
						return { reason: `${username} ${err.message}` };
					}
				})()
			);
			const contents = await Promise.all(promises);
			const titles = contents.filter((content): content is string => typeof content === 'string');
			const skips = skipUsernames.concat(contents.filter((content): content is Skip => typeof content !== 'string'));

			if (skips.length > 0) {
				await ctx.reply(skips.map((skip) => skip.reason).join('\n'));
			}
			if (titles.length === 0) {
				await ctx.react('🤔');
				return;
			}
			await ctx.reply(titles.join('\n'));
		});

		return await webhookCallback(bot, 'cloudflare-mod')(request);
	},
};
