const direct = (label, url) => ({ label, url, kind: "direct" });
const paper = (label, id) => direct(label, `https://arxiv.org/abs/${id}`);

export default {
  "8.3": [
    paper("ReAct: Synergizing Reasoning and Acting in Language Models", "2210.03629"),
    paper("Toolformer: Language Models Can Teach Themselves to Use Tools", "2302.04761"),
    paper("Gorilla: Large Language Model Connected with Massive APIs", "2305.15334"),
    paper("Reflexion: Language Agents with Verbal Reinforcement Learning", "2303.11366"),
    paper("AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation", "2308.08155"),
    paper("AgentBench: Evaluating LLMs as Agents", "2308.03688"),
    paper("Search-R1: Training LLMs to Reason and Leverage Search Engines with Reinforcement Learning", "2503.09516"),
    direct("OpenAI · Function calling guide", "https://platform.openai.com/docs/guides/function-calling"),
  ],
  "8.4": [
    paper("Lost in the Middle: How Language Models Use Long Contexts", "2307.03172"),
    paper("MemGPT: Towards LLMs as Operating Systems", "2310.08560"),
    paper("LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory", "2410.10813"),
    paper("MemoryBank: Enhancing Large Language Models with Long-Term Memory", "2305.10250"),
    paper("Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", "2005.11401"),
    paper("Transformer-XL: Attentive Language Models Beyond a Fixed-Length Context", "1901.02860"),
    paper("Compressive Transformers for Long-Range Sequence Modelling", "1911.05507"),
    paper("Recurrent Memory Transformer", "2207.06881"),
  ],
};
