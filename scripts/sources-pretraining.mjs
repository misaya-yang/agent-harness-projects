const direct = (label, url) => ({ label, url, kind: "direct" });
const paper = (label, id) => direct(label, `https://arxiv.org/abs/${id}`);

export default {
  "6.3": [
    direct("Keller Jordan · Muon: An optimizer for hidden layers in neural networks", "https://kellerjordan.github.io/posts/muon/"),
    paper("Muon is Scalable for LLM Training（Moonlight）", "2502.16982"),
    paper("Kimi K2: Open Agentic Intelligence（§2.1 MuonClip）", "2507.20534"),
    paper("DeepSeek-V4 技术报告（预览版，§2.4 Muon 与 §3.4.1）", "2606.19348"),
    paper("The Polar Express: Optimal Matrix Sign Methods and Their Application to the Muon Algorithm", "2505.16932"),
    paper("Old Optimizer, New Norm: An Anthology（Bernstein & Newhouse）", "2409.20325"),
  ],
};
