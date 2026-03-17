const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID!
const DISCORD_WHITELIST_ROLE_ID = process.env.DISCORD_WHITELIST_ROLE_ID!
const DISCORD_ROLE_TO_REMOVE_ON_WHITELIST = '1439609608137080924'

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

  // Handle 204 No Content responses (e.g., role assignment/removal)
  if (res.status === 204) {
    return null
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

export async function getUserRoles(userId: string): Promise<string[]> {
  try {
    const member = await discordFetch(`/guilds/${DISCORD_GUILD_ID}/members/${userId}`)
    return member?.roles || []
  } catch {
    return []
  }
}

export async function assignRole(userId: string, roleId: string): Promise<boolean> {
  try {
    // Assign the whitelist role
    await discordFetch(
      `/guilds/${DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`,
      { method: 'PUT' }
    )

    // Remove the pre-whitelist role
    try {
      await discordFetch(
        `/guilds/${DISCORD_GUILD_ID}/members/${userId}/roles/${DISCORD_ROLE_TO_REMOVE_ON_WHITELIST}`,
        { method: 'DELETE' }
      )
    } catch (e) {
      // Log but don't fail if role removal fails (user may not have it)
      console.warn('Could not remove pre-whitelist role:', e)
    }

    return true
  } catch (e) {
    console.error('Failed to assign role:', e)
    return false
  }
}

export async function removeRole(userId: string, roleId: string): Promise<boolean> {
  try {
    await discordFetch(
      `/guilds/${DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`,
      { method: 'DELETE' }
    )
    return true
  } catch (e) {
    console.error('Failed to remove role:', e)
    return false
  }
}

export async function assignWhitelistRole(userId: string): Promise<boolean> {
  return assignRole(userId, DISCORD_WHITELIST_ROLE_ID)
}

export async function removeWhitelistRole(userId: string): Promise<boolean> {
  return removeRole(userId, DISCORD_WHITELIST_ROLE_ID)
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
