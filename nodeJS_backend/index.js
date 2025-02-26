import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import path from "path";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOllama } from "@langchain/ollama";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { OllamaEmbeddings } from "@langchain/ollama";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

// Allow requests from http://localhost:3000
app.use(cors({ origin: "http://localhost:3000" }));

app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// Custom embedding class with non-recursive implementations
class CustomOllamaEmbeddings extends OllamaEmbeddings {
  async embedDocuments(texts) {
    return this._embedTexts(texts);
  }

  async embedQuery(text) {
    return (await this.embedDocuments([text]))[0];
  }
  
  async _embedTexts(texts) {
    // Implement the actual embedding API call here.
    // For demonstration purposes, we return dummy embeddings.
    return texts.map(() => [0.1, 0.2, 0.3]);
  }
}

const MODEL = "deepseek-r1:1.5b";
const EMBEDDING_MODEL = new CustomOllamaEmbeddings({ model: MODEL });
const LANGUAGE_MODEL = new ChatOllama({
  model: MODEL,
  baseUrl: "http://localhost:11434",
  temperature: 0.1,
});

// Create a memory vector store (global)
let vectorStore = new MemoryVectorStore(EMBEDDING_MODEL);

// POST endpoint to handle PDF uploads and process the document
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    // Save the uploaded file to a temporary location
    const tempFilePath = path.join(__dirname, "temp.pdf");
    fs.writeFileSync(tempFilePath, req.file.buffer);

    // Load the PDF
    const loader = new PDFLoader(tempFilePath);
    const rawDocs = await loader.load();

    // Create document chunks using the recursive character text splitter
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 3000, chunkOverlap: 400 });
    const docs = await splitter.splitDocuments(rawDocs);

    // Index the document chunks in the vector store
    await vectorStore.addDocuments(docs);

    // Remove the temporary file
    fs.unlinkSync(tempFilePath);

    res.status(200).json({ message: "Document processed successfully" });
  } catch (error) {
    console.error("Error processing file:", error);
    res.status(500).json({ error: "Failed to process file" });
  }
});

// POST endpoint to receive a user query and generate an answer
app.post("/query", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    // Retrieve relevant documents (top 3 results)
    const relevantDocs = await vectorStore.similaritySearch(query, 3);
    const context = relevantDocs.map((doc) => doc.pageContent).join("\n\n");

    // Define and use the ChatPromptTemplate
    const promptTemplateString = `You are an expert research assistant. Use the provided context to answer the query. 
If unsure, state that you don't know. Be concise and factual.
Query: {user_query}
Context: {document_context}
Answer:`;

    const promptTemplate = ChatPromptTemplate.fromTemplate(promptTemplateString);
    // Format the prompt with the actual query and context
    const formattedPrompt = await promptTemplate.format({
      user_query: query,
      document_context: context,
    });
    
    console.log("line 109",formattedPrompt);
    // Call the language model with the formatted prompt using invoke instead of call
    const response = await LANGUAGE_MODEL.invoke([{ role: "user", content: formattedPrompt }]);
    
    res.status(200).json({ answer: response.content || response });
  } catch (error) {
    console.error("Error generating answer:", error);
    res.status(500).json({ error: "Failed to generate answer" });
  }
});

app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});
