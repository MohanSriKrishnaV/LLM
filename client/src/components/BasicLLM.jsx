import React, { useState, useEffect, useRef } from 'react'
import { chatAPI } from '../api/chatAPI'
import './ChatWindow.css'

export const BasicLLM = () => {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful AI assistant. Be concise, friendly, and accurate in your responses. If you don\'t know something, say so.')
  const [loading, setLoading] = useState(false)
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(500)
  const [topP, setTopP] = useState(0.9)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    fetchChatHistory()
  }, [])

  const fetchChatHistory = async () => {
    try {
      const history = await chatAPI.getChatHistory()
      setMessages(history)
    } catch (error) {
      console.error('Error fetching chat history:', error)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage = { role: 'user', content: input, timestamp: new Date() }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const options = { temperature, maxTokens, topP }
      const response = await chatAPI.sendMessage(input, systemPrompt, options)
      const assistantMessage = {
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
        usage: response.usage
      }
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage = { role: 'assistant', content: 'Error: Could not get response', timestamp: new Date() }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleClearHistory = async () => {
    if (window.confirm('Are you sure you want to delete all chat history? This cannot be undone.')) {
      try {
        await chatAPI.clearHistory()
        setMessages([])
      } catch (error) {
        console.error('Error clearing history:', error)
        alert('Failed to clear history: ' + error.message)
      }
    }
  }

  return (
    <div className="chat-window">
      <header className="chat-header">
        <h1>Chat</h1>
        <button
          type="button"
          onClick={() => setShowSystemPrompt(!showSystemPrompt)}
          className="toggle-button"
        >
          System Prompt
        </button>
      </header>

      {showSystemPrompt && (
        <section className="system-prompt-input-container">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Enter system prompt..."
            className="system-prompt-textarea"
          />

          <div className="parameter-controls">
            <div className="parameter-group">
              <label className="parameter-label">
                Temperature: {temperature}
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="parameter-slider"
                />
              </label>
              <small className="parameter-help">Lower = more focused, Higher = more creative</small>
            </div>

            <div className="parameter-group">
              <label className="parameter-label">
                Max Tokens: {maxTokens}
                <input
                  type="range"
                  min="50"
                  max="2000"
                  step="50"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="parameter-slider"
                />
              </label>
              <small className="parameter-help">Maximum response length</small>
            </div>

            <div className="parameter-group">
              <label className="parameter-label">
                Top P: {topP}
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={topP}
                  onChange={(e) => setTopP(parseFloat(e.target.value))}
                  className="parameter-slider"
                />
              </label>
              <small className="parameter-help">Token diversity (0.1 = focused, 1.0 = diverse)</small>
            </div>
          </div>
        </section>
      )}

      <div className="messages-container">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-row ${msg.role === 'user' ? 'user-row' : 'assistant-row'}`}>
            <article className={`message message-${msg.role}`}>
              <div className="message-content">{msg.content}</div>
              <div className="message-meta">
                <span className="message-role">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
                <span className="message-timestamp">{new Date(msg.timestamp).toLocaleTimeString()}</span>
              </div>
              {msg.usage && (
                <div className="message-usage">
                  <span>{msg.usage.totalTokens} tokens ({msg.usage.inputTokens} in, {msg.usage.outputTokens} out)</span>
                  <span>${msg.usage.cost.totalCost} USD</span>
                </div>
              )}
            </article>
          </div>
        ))}

        {loading && (
          <div className="message-row assistant-row">
            <article className="message message-assistant">
              <span className="loading">Thinking...</span>
            </article>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message Chat"
          disabled={loading}
          className="message-input"
        />
        <button type="submit" disabled={loading} className="send-button">
          Send
        </button>
        <button
          type="button"
          onClick={handleClearHistory}
          className="clear-button"
          title="Delete all chat history"
        >
          Clear
        </button>
      </form>
    </div>
  )
}
