const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID!
const DISCORD_WHITELIST_ROLE_ID = process.env.DISCORD_WHITELIST_ROLE_ID!

const DISCORD_API = 'https://discord.com/api/v10'

async function discordFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${DISCORD_API}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const error = await res.text()
    console.error('Discord API error:', res.status, error)
    throw new Error(`Discord API error: ${res.status}`)
  }

  return res.json()
}

export async function isUserInGuild(userId: string): Promise<boolean> {
  try {
    await discordFetch(`/guilds/${DISCORD_GUILD_ID}/members/${userId}`)
    return true
  } catch {
    return false
  }
}

export async function assignWhitelistRole(userId: string): Promise<boolean> {
  try {
    await discordFetch(
      `/guilds/${DISCORD_GUILD_ID}/members/${userId}/roles/${DISCORD_WHITELIST_ROLE_ID}`,
      { method: 'PUT' }
    )
    return true
  } catch (e) {
    console.error('Failed to assign role:', e)
    return false
  }
}

export async function removeWhitelistRole(userId: string): Promise<boolean> {
  try {
    await discordFetch(
      `/guilds/${DISCORD_GUILD_ID}/members/${userId}/roles/${DISCORD_WHITELIST_ROLE_ID}`,
      { method: 'DELETE' }
    )
    return true
  } catch (e) {
    console.error('Failed to remove role:', e)
    return false
  }
}

export async function sendDM(userId: string, message: string): Promise<boolean> {
  try {
    // Create DM channel
    const channel = await discordFetch('/users/@me/channels', {
      method: 'POST',
      body: JSON.stringify({ recipient_id: userId }),
    })

    // Send message
    await discordFetch(`/channels/${channel.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: message }),
    })

    return true
  } catch (e) {
    console.error('Failed to send DM:', e)
    return false
  }
}

export async function sendEmbedDM(userId: string, embed: object): Promise<boolean> {
  try {
    const channel = await discordFetch('/users/@me/channels', {
      method: 'POST',
      body: JSON.stringify({ recipient_id: userId }),
    })

    await discordFetch(`/channels/${channel.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ embeds: [embed] }),
    })

    return true
  } catch (e) {
    console.error('Failed to send embed DM:', e)
    return false
  }
}

export async function sendWebhook(webhookUrl: string, embed: object): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    })

    if (!res.ok) {
      console.error('Webhook error:', res.status, await res.text())
      return false
    }

    return true
  } catch (e) {
    console.error('Failed to send webhook:', e)
    return false
  }
}
