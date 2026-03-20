import db from '../db/database.js'

export const chatService = {
  saveMessage: async (role, content) => {
    try {
      const result = await db.run(
        'INSERT INTO messages (role, content) VALUES (?, ?)',
        [role, content]
      )
      return result
    } catch (error) {
      console.error('Error saving message:', error)
      throw error
    }
  },

  getHistory: async () => {
    try {
      const messages = await db.all('SELECT * FROM messages ORDER BY id ASC')
      return messages
    } catch (error) {
      console.error('Error fetching messages:', error)
      throw error
    }
  },

  clearHistory: async () => {
    try {
      const result = await db.run('DELETE FROM messages')
      return result
    } catch (error) {
      console.error('Error clearing messages:', error)
      throw error
    }
  }
}
