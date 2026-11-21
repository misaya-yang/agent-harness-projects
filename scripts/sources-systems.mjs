const direct = (label, url) => ({ label, url, kind: "direct" });
const paper = (label, id) => direct(label, `https://arxiv.org/abs/${id}`);

const meanFlow = paper("Mean Flows for One-step Generative Modeling", "2505.13447");
const deepSeekV3 = paper("DeepSeek-V3 Technical Report", "2412.19437");
const deepSeekV4 = paper("DeepSeek-V4 技术报告（预览版 v1）", "2606.19348v1");
const kimiK3 = direct("Moonshot AI · Kimi K3 模型卡", "https://github.com/MoonshotAI/Kimi-K3");
const megatron = direct("NVIDIA · Advancing Emerging Optimizers for Accelerated LLM Training with NVIDIA Megatron", "https://developer.nvidia.com/blog/advancing-emerging-optimizers-for-accelerated-llm-training-with-nvidia-megatron/");
const rubin = direct("NVIDIA · Vera Rubin NVL72 官方规格", "https://www.nvidia.com/en-us/data-center/vera-rubin-nvl72/");
const semiKimi = direct("SemiAnalysis · Kimi K3: The Manos, The Mythos, The Legendos", "https://newsletter.semianalysis.com/p/kimi-k3-the-manos-the-mythos-the");

export default {
  "4.1": [
    paper("Denoising Diffusion Probabilistic Models（DDPM）", "2006.11239"),
    paper("Denoising Diffusion Implicit Models（DDIM）", "2010.02502"),
    paper("Score-Based Generative Modeling through Stochastic Differential Equations", "2011.13456"),
    paper("Flow-GRPO: Training Flow Matching Models via Online RL", "2505.05470"),
  ],
  "4.2": [
    paper("Flow Matching for Generative Modeling", "2210.02747"),
    paper("Flow Straight and Fast（Rectified Flow 与 Reflow）", "2209.03003"),
    paper("Mage-Flow: An Efficient Native-Resolution Foundation Model for Image Generation and Editing", "2607.19064"),
    direct("AMD ROCm · Flux architecture deep dive", "https://rocm.docs.amd.com/projects/primus/en/latest/04-technical-guides/diffusion-models/flux_architecture.html"),
    paper("Black Forest Labs · Self-Supervised Flow Matching for Scalable Multi-Modal Synthesis", "2603.06507"),
    meanFlow,
    paper("Stabilizing, Scaling & Enhancing MeanFlow for Large-scale Diffusion Distillation", "2605.17834"),
    paper("Overcoming the Curvature Bottleneck in MeanFlow", "2511.23342"),
    paper("Frieren: Efficient Video-to-Audio Generation Network with Rectified Flow Matching", "2406.00320"),
  ],
  "4.3": [
    paper("Classifier-Free Diffusion Guidance（CFG）", "2207.12598"),
    paper("Eliminating Oversaturation and Artifacts of High Guidance Scales in Diffusion Models（APG）", "2410.02416"),
    direct("Improving Classifier-Free Guidance of Flow Matching via Manifold Projection（ICML 2026）", "https://icml.cc/virtual/2026/poster/64946"),
    paper("CACFG: Curvature-Aware Classifier-Free Guidance and Optimal Control", "2610.05845"),
    paper("Few-Step Distillation for Text-to-Image Generation: A Practical Guide", "2512.13006"),
    paper("Mean Flow Distillation: Robust and Stable Distillation for Flow Matching Models", "2606.11155"),
    meanFlow,
  ],
  "5.1": [
    deepSeekV4,
    kimiK3,
    paper("NVIDIA · Pretraining Large Language Models with NVFP4", "2509.25149"),
    megatron,
    rubin,
    direct("ServeTheHome · Rubin GPU 出货规格更新", "https://www.servethehome.com/nvidia-updates-rubin-gpu-specs-as-first-production-hardware-arrives/"),
    direct("SemiAnalysis · Another Giant Leap: The Rubin CPX Specialized Accelerator & Rack", "https://newsletter.semianalysis.com/p/another-giant-leap-the-rubin-cpx-specialized-accelerator-rack"),
    semiKimi,
    paper("Spectral Scaling Laws of Muon", "2606.04058"),
    direct("Keller Jordan · Muon: An optimizer for hidden layers in neural networks", "https://kellerjordan.github.io/posts/muon/"),
    direct("NVIDIA · H100 Tensor Core GPU 规格", "https://www.nvidia.com/en-us/data-center/h100/"),
    direct("NVIDIA · GB300 NVL72 规格", "https://www.nvidia.com/en-us/data-center/gb300-nvl72/"),
    deepSeekV3,
    paper("Reducing Activation Recomputation in Large Transformer Models（Megatron 激活估算）", "2205.05198"),
    direct("SemiAnalysis · AgentX / InferenceXv3 推理基准", "https://newsletter.semianalysis.com/p/agentx-inferencexv3-does-cuda-moat"),
    direct("OpenRouter · Kimi K3 服务商报价", "https://openrouter.ai/moonshotai/kimi-k3"),
  ],
  "5.2": [
    paper("ZeRO: Memory Optimizations Toward Training Trillion Parameter Models", "1910.02054"),
    direct("PyTorch · Fully Sharded Data Parallel（FSDP2）", "https://docs.pytorch.org/docs/stable/distributed.fsdp.fully_shard.html"),
    paper("Efficient Large-Scale Language Model Training on GPU Clusters Using Megatron-LM", "2104.04473"),
    deepSeekV4,
    megatron,
    semiKimi,
    direct("Moonshot AI · Kimi K3 完整技术报告", "https://github.com/MoonshotAI/Kimi-K3/blob/main/k3_tech_report.pdf"),
    rubin,
  ],
  "5.3": [
    deepSeekV4,
    paper("Kimi K2: Open Agentic Intelligence（MuonClip 与 QK-Clip）", "2507.20534"),
    direct("Fireworks · MuonClip: How QK-Clip Stops Attention Score Explosions", "https://fireworks.ai/research/muonclip-attention-score-explosions"),
    direct("苏剑林 · QK-Clip：让 Muon 在 Scaleup 之路上更进一步（MaxLogit）", "https://kexue.fm/archives/11126"),
    deepSeekV3,
  ],
  "5.4": [
    paper("Evan Miller · Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations", "2411.00640"),
    direct("Anthropic · A statistical approach to model evaluations", "https://www.anthropic.com/research/statistical-approach-to-model-evals"),
    paper("Position: Don't Use the CLT in LLM Evals With Fewer Than a Few Hundred Datapoints", "2503.01747"),
    paper("Measuring all the noises of LLM Evals", "2512.21326"),
    paper("On Randomness in Agentic Evals", "2602.07150"),
    direct("Anthropic · Infrastructure noise in agentic coding evals", "https://www.anthropic.com/research/infrastructure-noise"),
    paper("Stop Comparing LLM Agents Without Disclosing the Harness", "2605.23950"),
    paper("DeltaSelect: Affordable A/B Testing for Coding Agents", "2609.19607"),
    paper("Evaluating Large Language Models Trained on Code（pass@k 估计）", "2107.03374"),
    direct("Terminal-Bench · 2.1 排行榜和提交说明", "https://www.tbench.ai/?version=2.1"),
  ],
};
