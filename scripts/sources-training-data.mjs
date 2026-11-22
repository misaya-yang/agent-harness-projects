const direct = (label, url) => ({ label, url, kind: "direct" });
const paper = (label, id) => direct(label, `https://arxiv.org/abs/${id}`);

export default {
  "6.2": [
    paper("Deduplicating Training Data Makes Language Models Better", "2107.06499"),
    paper("The RefinedWeb Dataset for Falcon LLM", "2306.01116"),
    paper("Dolma: an Open Corpus of Three Trillion Tokens for Language Model Pretraining Research", "2402.00159"),
    paper("DataComp-LM: In Search of the Next Generation of Training Sets for Language Models", "2406.11794"),
    paper("Language Models are Few-Shot Learners（GPT-3，Appendix C：训练数据污染）", "2005.14165"),
    paper("Quantifying Memorization Across Neural Language Models", "2202.07646"),
  ],
  "2.9": [
    paper("STaR: Bootstrapping Reasoning With Reasoning", "2203.14465"),
    paper("Self-Instruct: Aligning Language Models with Self-Generated Instructions", "2212.10560"),
    paper("Orca: Progressive Learning from Complex Explanation Traces of GPT-4", "2306.02707"),
    paper("The Curse of Recursion: Training on Generated Data Makes Models Forget", "2305.17493"),
    paper("DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning", "2501.12948"),
  ],
};
