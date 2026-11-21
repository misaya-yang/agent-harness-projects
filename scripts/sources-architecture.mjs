const direct = (label, url) => ({ label, url, kind: "direct" });
const arxiv = (id, label) => direct(label, `https://arxiv.org/abs/${id}`);

const deepseekV4 = (context = "") => arxiv("2606.19348v1", `DeepSeek-V4 技术报告（preview 版${context}）`);
const deepseekV3 = arxiv("2412.19437", "DeepSeek-V3 技术报告");
const kimiCard = direct("Moonshot AI · Kimi K3 模型卡", "https://github.com/MoonshotAI/Kimi-K3");
const kimiReport = direct("Moonshot AI · Kimi K3 技术报告", "https://github.com/MoonshotAI/Kimi-K3/blob/main/k3_tech_report.pdf");
const kimiLinear = arxiv("2510.26692", "Kimi Linear: An Expressive, Efficient Attention Architecture");
const gallery = (topic, card) => direct(`Sebastian Raschka · LLM Architecture Gallery（${topic}）`, `https://sebastianraschka.com/llm-architecture-gallery/#card-${card}`);

export default {
  "1.1": [
    arxiv("2502.05795", "The Curse of Depth in Large Language Models"),
    arxiv("2603.15031", "Kimi Team · Attention Residuals"),
    gallery("Kimi K3 的 Attention Residuals", "kimi-k3"),
    direct("DataCamp · Attention Residuals Explained: Rethinking Transformer Depth", "https://www.datacamp.com/blog/attention-residuals-explained"),
    arxiv("2505.06708", "Gated Attention for Large Language Models: Non-linearity, Sparsity, and Attention-Sink-Free（NeurIPS 2025）"),
    deepseekV4("，mHC"),
    kimiCard,
    arxiv("2502.02732", "Peri-LN: Revisiting Normalization Layer in the Transformer Architecture"),
  ],
  "1.2": [
    arxiv("2608.10021", "Position Encoding in Transformers: From Absolute and Relative Methods to Rotary Position Embeddings and Long-Context Scaling"),
    direct("Sebastian Raschka · Understanding Positional Embeddings in Modern LLMs（2026）", "https://magazine.sebastianraschka.com/p/understanding-positional-embeddings"),
    arxiv("2603.11611", "Fractional Rotation, Full Potential? Investigating Performance and Convergence of Partial RoPE"),
    arxiv("2609.38530", "Shifting Mechanisms: How Positional Encoding Choice Shapes In-Context Retrieval"),
    kimiLinear,
    arxiv("2405.04434", "DeepSeek-V2 技术报告"),
    deepseekV4(),
    direct("雷峰网 · DeepSeek V4 Pro 与 Harness 拆解（第三方 YaRN 配置整理）", "https://www.leiphone.com/category/yanxishe/dufRSsU0sr3hCOII.html"),
    arxiv("2505.21487", "Hardware-Efficient Attention for Fast Decoding"),
  ],
  "1.3": [
    deepseekV3,
    deepseekV4("，此处采用架构数字，正式版 checkpoint 的后训练细节可能不同"),
    direct("NVIDIA · Megatron Bridge 的 DeepSeek V4 文档", "https://docs.nvidia.com/nemo/megatron-bridge/0.7.1/models/deepseek/deepseek-v4.html"),
    gallery("DeepSeek V4-Pro 的 CSA / HCA", "deepseek-v4-pro"),
    kimiCard,
    direct("SemiAnalysis · Kimi K3: The Manos, The Mythos, The Legendos", "https://newsletter.semianalysis.com/p/kimi-k3-the-manos-the-mythos-the"),
    direct("PyTorch · Using Muon Optimizer with DeepSpeed（GLM-5 Muon Split）", "https://pytorch.org/blog/using-muon-optimizer-with-deepspeed/"),
  ],
  "1.4": [
    kimiCard,
    kimiReport,
    direct("Moonshot AI · Kimi K3 技术解读（Stable LatentMoE、Quantile Balancing）", "https://www.kimi.com/en/blog/kimi-k3"),
    arxiv("2601.18089", "LatentMoE: Toward Optimal Accuracy per FLOP and Parameter in Mixture of Experts"),
    gallery("Kimi K3 的 Stable LatentMoE", "kimi-k3"),
    arxiv("2609.28053", "Exact Quantile Balancing and Load-Error Injection for Mixture-of-Experts"),
    deepseekV3,
    deepseekV4("，§2 与 §3.1"),
  ],
  "1.5": [
    arxiv("2205.14135", "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness"),
    arxiv("2603.05451", "FlashAttention-4: Algorithm and Kernel Pipelining Co-Design for Asymmetric Hardware Scaling（MLSys 2026）"),
    direct("NVIDIA Research · Pushing Intelligence to 4-bit（2026-06）", "https://research.nvidia.com/labs/eai/blogs/pushing-intelligence-to-4-bit/"),
    deepseekV4(),
  ],
  "1.6": [
    direct("MiniMax · Why Did M2 End Up as a Full Attention Model?", "https://www.minimax.io/news/why-did-m2-end-up-as-a-full-attention-model"),
    direct('LMSYS / SGLang · "No Free Lunch": Deconstruct Efficient Attention with MiniMax M2', "https://www.lmsys.org/blog/2025-11-04-miminmax-m2"),
    kimiLinear,
    gallery("Kimi Linear 的 Hybrid Attention", "kimi-linear-48b-a3b"),
    direct("Maxime Labonne · Qwen3.5: Nobody Agrees on Attention Anymore", "https://huggingface.co/blog/mlabonne/qwen35"),
    arxiv("2608.30320", "On the Design of Qwen3.8-Next Architecture: Evaluation, Efficiency, and Training Stability"),
    arxiv("2611.10844", "What Broke & Why: Practical Lessons from Reinforcement Learning Post-Training"),
    arxiv("2512.02556", "DeepSeek-V3.2 技术报告"),
    direct("NVIDIA Research · Sparse Attention Still Has a Dense Problem", "https://research.nvidia.com/labs/nemotron/spin/"),
    kimiCard,
  ],
  "2.1": [
    arxiv("2508.05629", "On the Generalization of SFT: A Reinforcement Learning Perspective with Reward Rectification（DFT，ICLR 2026）"),
    arxiv("2604.13016", "Rethinking On-Policy Distillation of Large Language Models: Phenomenology, Mechanism, and Recipe"),
    arxiv("2606.00305", "Bridging Reasoning Trajectories in On-Policy Distillation via Near-Future Guidance"),
    arxiv("2603.07079", "Entropy-Aware On-Policy Distillation of Language Models"),
    arxiv("2608.25643", "A Token-Level Analysis of Sampled-Token Reverse-KL On-Policy Distillation"),
    arxiv("2603.25562", "Revisiting On-Policy Distillation: Empirical Failure Modes and Simple Fixes"),
    deepseekV4(),
    kimiReport,
    direct("Moonshot AI · Kimi K3 技术报告摘要", "https://www.kimi.com/en/blog/kimi-k3"),
    direct("HyperAI · Kimi K3 模型架构解析", "https://hyper.ai/cn/stories/8cf35aebd06a8a75904a2770be496f48"),
  ],
  "2.2": [
    arxiv("2203.02155", "InstructGPT: Training Language Models to Follow Instructions with Human Feedback"),
    arxiv("2210.10760", "Scaling Laws for Reward Model Overoptimization"),
    deepseekV4(),
    arxiv("2510.07743", "OpenRubrics: Towards Scalable Synthetic Rubric Generation for Reward Modeling and LLM Alignment"),
    arxiv("2509.21500", "Chasing the Tail: Effective Rubric-based Reward Modeling for Large Language Model Post-Training（ICLR 2026）"),
    arxiv("2511.18397", "Anthropic · Natural Emergent Misalignment from Reward Hacking in Production RL"),
    direct("Anthropic 研究博客 · Natural Emergent Misalignment from Reward Hacking", "https://www.anthropic.com/research/emergent-misalignment-reward-hacking"),
    direct("A Survey on Rubric-guided Reinforcement Learning for Language Models（EMNLP 2026 Findings）", "https://aclanthology.org/2026.findings-emnlp.1599/"),
  ],
};
