# Chats Marker Bot

_Chats Marker Bot_ is a Telegram bot helps mark channels and groups. Just send or forward message contains Telegram links to the bot, it will helps resolve links and reply the links in a clean format.

## How to deploy

Fork this GitHub repository, add a repository secrets `CLOUDFLARE_API_TOKEN` with a [CloudFlare API Token](https://dash.cloudflare.com/profile/api-tokens). Then enable GitHub Actions and manually run the deploy workflow.

A Telegram bot token is required to configure, which can be created with [BotFather](https://t.me/BotFather). After the bot token created, open CloudFlare worker settings and add an environment variable `BOT_TOKEN`.

Now visit the URL to set the webhook, replace `<BOT_TOKEN>` and `<SUBDOMAIN>` with an actual value:

```
https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://chats-marker-bot.<SUBDOMAIN>.workers.dev/
```
