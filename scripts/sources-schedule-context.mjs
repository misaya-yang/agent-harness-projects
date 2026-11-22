const paper = (label, id) => ({ label, url: `https://arxiv.org/abs/${id}`, kind: "direct" });

export default {
  "6.4": [
    paper("MiniCPM: Unveiling the Potential of Small Language Models with Scalable Training Strategies（WSD）", "2404.06395"),
    paper("SGDR: Stochastic Gradient Descent with Warm Restarts（余弦退火）", "1608.03983"),
    paper("On the Adequacy of Untuned Warmup for Adaptive Optimization", "1910.04209"),
    paper("Tensor Programs V: Tuning Large Neural Networks via Zero-Shot Hyperparameter Transfer（μP 与 μTransfer）", "2203.03466"),
  ],
  "6.5": [
    paper("The Llama 3 Herd of Models（预训练数据与长上下文训练）", "2407.21783"),
    paper("Extending Context Window of Large Language Models via Positional Interpolation", "2306.15595"),
    paper("YaRN: Efficient Context Window Extension of Large Language Models", "2309.00071"),
    paper("RULER: What's the Real Context Size of Your Long-Context Language Models?", "2404.06654"),
    paper("LongBench: A Bilingual, Multitask Benchmark for Long Context Understanding", "2308.14508"),
    paper("Lost in the Middle: How Language Models Use Long Contexts", "2307.03172"),
  ],
};
