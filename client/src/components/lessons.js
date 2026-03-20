import {BasicLLM} from "./BasicLLM"
import {ToolingLLM} from "./ToolingLLM"
import {HuggingFaceLLM} from "./HuggingFaceLLM"
import {BasicRAG} from "./BasicRAG"
import {LangRAG} from "./LangRAG"
import {ImprovedRAG} from "./ImprovedRAG"
import {ModifiedRAG} from "./ModifiedRAG"

export const lessons = [
  {
    title: "Basic LLM",
    route: "/basic-llm",
    component: BasicLLM
  },
  {
    title: "Tooling LLM",
    route: "/tooling-llm",
    component: ToolingLLM
  },
  {
    title: "Hugging Face ",
    route: "/huggingFace",
    component: HuggingFaceLLM
  },
   {
    title: "Basic RAG",
    route: "/BasicRAG",
    component: BasicRAG
  },
  {
    title: "Lang chain RAG",
    route: "/AdvancedRAG",
    component: LangRAG
  },
    {
    title: "Imrpoved RAG",
    route: "/ImrpovedRAG",
    component: ImprovedRAG
  },
   {
    title: "Modified RAG",
    route: "/ModifiedRAG",
    component: ModifiedRAG
  }
]