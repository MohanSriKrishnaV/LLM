import React from "react"
import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { lessons } from "./components/lessons"
import { MenuBar } from "./components/MenuBar"
import "./App.css"

function App() {
  return (
    <Router>
      <div className="app">

        <MenuBar />

        <Routes>
          {lessons.map((lesson) => (
            <Route
              key={lesson.route}
              path={lesson.route}
              element={<lesson.component />}
            />
          ))}
        </Routes>

      </div>
    </Router>
  )
}

export default App