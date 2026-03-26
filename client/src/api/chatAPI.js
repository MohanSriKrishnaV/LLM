import axios from 'axios'

const API_BASE_URL = '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

export const chatAPI = {
  sendMessage: async (message, systemPrompt, options) => {
    try {
      const response = await api.post('/chat', { message, systemPrompt, options })
      return response.data
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  },

  getChatHistory: async () => {
    try {
      const response = await api.get('/chat/history')
      return response.data.messages || []
    } catch (error) {
      console.error('Error fetching chat history:', error)
      return []
    }
  },

  clearHistory: async () => {
    try {
      const response = await api.delete('/chat/history')
      return response.data
    } catch (error) {
      console.error('Error clearing history:', error)
      throw error
    }
  },


    sendMessageHF: async (message, systemPrompt, options) => {
    try {
      const response = await api.post('/chatHF', { message, systemPrompt, options })
      return response.data
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  },

  sendMessageRAG: async (message, systemPrompt, options) => {
    try {
      const response = await api.post('/chatRAG', { message, systemPrompt, options })
      return response.data
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  } ,


    sendMessageLang: async (message, systemPrompt, options) => {
    try {
      const response = await api.post('/chatLang', { message, systemPrompt, options })
      return response.data
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  } ,
  sendMessageImpLang: async (message, systemPrompt, options) => {
    try {
      const response = await api.post('/chatImpLang', { message, systemPrompt, options })
      return response.data
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  }
,
   sendMessageImpRAGLang: async (message, systemPrompt, options) => {
    try {
      const response = await api.post('/chatModRAG', { message, systemPrompt, options })
      return response.data
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  }


}



