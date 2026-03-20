import React from "react"
import { Link } from "react-router-dom"
import { lessons } from "./lessons"

export function MenuBar() {
  return (
    <nav className="menu-bar">
      {lessons.map((lesson) => (
        <Link key={lesson.route} to={lesson.route} className="menu-item">
          {lesson.title}
        </Link>
      ))}
    </nav>
  )
}