import express from 'express'
import { chatService } from '../services/chatService.js'
import { llamaService } from '../services/llamaService.js'
import { hfService } from '../services/hfService.js'
import { RagService } from '../services/RagService.js'
import { LangService } from '../services/LangService.js'
import { ImpRAGService } from '../services/ImpRAGService.js'
import { modifiedRAGService } from '../services/ModifiedRAGService.js'


const router = express.Router()

router.post('/chat', async (req, res) => {
  try {
    const { message, systemPrompt, options } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message' })
    }

    const convo = await chatService.getHistory();
    const result = await llamaService.generateResponse(
      message,
      convo,
      systemPrompt,
      options
    )

    res.json(result)

  } catch (error) {
    console.error('Error in chat endpoint:', error)

    res.status(500).json({
      error: error.message || 'Internal server error'
    })
  }
})



router.post('/chatHF', async (req, res) => {
  try {
    const { message, systemPrompt, options } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message' })
    }

    const convo = await chatService.getHistory();
    const result = await hfService.generateResponse(
      message,
      convo,
      systemPrompt,
      options
    )

    res.json(result)

  } catch (error) {
    console.error('Error in chat endpoint:', error)

    res.status(500).json({
      error: error.message || 'Internal server error'
    })
  }
})

router.get('/chat/history', async (req, res) => {
  try {
    const messages = await chatService.getHistory()
    res.json({ messages })
  } catch (error) {
    console.error('Error fetching history:', error)
    res.status(500).json({ error: 'Failed to fetch chat history' })
  }
})

router.delete('/chat/history', async (req, res) => {
  try {
    await chatService.clearHistory()
    res.json({ success: true, message: 'Chat history cleared' })
  } catch (error) {
    console.error('Error clearing history:', error)
    res.status(500).json({ error: 'Failed to clear chat history' })
  }
})


router.post('/chatRAG', async (req, res) => {
  try {
        await RagService.loadBase();

    const { message, systemPrompt, options } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message' })
    }

    const result = await RagService.generateResponse(
      message,
      systemPrompt,
      options
    )

    res.json(result)

  } catch (error) {
    console.error('Error in chat endpoint:', error)

    res.status(500).json({
      error: error.message || 'Internal server error'
    })
  }
})

router.post('/chatLang', async (req, res) => {
  try {
        // await LangService.loadBase();
    const { message, systemPrompt, options } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message' })
    }

    const result = await LangService.generateResponse(
      message,
      systemPrompt,
      options
    )

    res.json(result)

  } catch (error) {
    console.error('Error in chat endpoint:', error)

    res.status(500).json({
      error: error.message || 'Internal server error'
    })
  }
})

router.post('/chatImpLang', async (req, res) => {
  try {
        // await ImpRAGService.loadBase();
    const { message, systemPrompt, options } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message' })
    }

    const result = await ImpRAGService.generateResponse(
      message,
      systemPrompt,
      options
    )

    res.json(result)

  } catch (error) {
    console.error('Error in chat endpoint:', error)

    res.status(500).json({
      error: error.message || 'Internal server error'
    })
  }
})


router.post('/chatImpRAGLang', async (req, res) => {
  try {
        // await ImpRAGService.loadBase();
    const { message, systemPrompt, options } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message' })
    }

    const result = await modifiedRAGService.generateResponse(
      message,
      systemPrompt,
      options
    )

    res.json(result)

  } catch (error) {
    console.error('Error in chat endpoint:', error)

    res.status(500).json({
      error: error.message || 'Internal server error'
    })
  }
})







export default router
