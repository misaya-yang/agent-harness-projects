const direct = (label, url) => ({ label, url, kind: "direct" });
const paper = (label, id) => direct(label, `https://arxiv.org/abs/${id}`);

export default {
  "6.1": [
    paper("Scaling Laws for Neural Language Models（Kaplan et al.）", "2001.08361"),
    paper("Training Compute-Optimal Large Language Models（Chinchilla）", "2203.15556"),
    paper("Chinchilla Scaling: A replication attempt（Epoch AI 重新拟合）", "2404.10102"),
    paper("Reconciling Kaplan and Chinchilla Scaling Laws", "2406.12907"),
    paper("Resolving Discrepancies in Compute-Optimal Scaling of Language Models", "2406.19146"),
    paper("Beyond Chinchilla-Optimal: Accounting for Inference in Language Model Scaling Laws", "2401.00448"),
    paper("Scaling Data-Constrained Language Models（数据重复的衰减）", "2305.16264"),
    paper("Are Emergent Abilities of Large Language Models a Mirage?", "2304.15004"),
    paper("The Llama 3 Herd of Models（§3.2.1 Scaling Laws）", "2407.21783"),
    direct("Meta · Introducing Meta Llama 3（8B 训练 15T token 仍在改进）", "https://ai.meta.com/blog/meta-llama-3/"),
  ],
  "6.3": [
    direct("Keller Jordan · Muon: An optimizer for hidden layers in neural networks", "https://kellerjordan.github.io/posts/muon/"),
    paper("Muon is Scalable for LLM Training（Moonlight）", "2502.16982"),
    paper("Kimi K2: Open Agentic Intelligence（§2.1 MuonClip）", "2507.20534"),
    paper("DeepSeek-V4 技术报告（预览版，§2.4 Muon 与 §3.4.1）", "2606.19348"),
    paper("The Polar Express: Optimal Matrix Sign Methods and Their Application to the Muon Algorithm", "2505.16932"),
    paper("Old Optimizer, New Norm: An Anthology（Bernstein & Newhouse）", "2409.20325"),
  ],
};
