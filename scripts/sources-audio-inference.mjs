const direct = (label, url) => ({ label, url, kind: "direct" });
const paper = (label, id) => direct(label, `https://arxiv.org/abs/${id}`);

export default {
  "3.4": [
    direct("Connectionist Temporal Classification（Graves et al., ICML 2006）", "https://www.cs.toronto.edu/~graves/icml_2006.pdf"),
    paper("SoundStream: An End-to-End Neural Audio Codec", "2107.03312"),
    paper("High Fidelity Neural Audio Compression（EnCodec）", "2210.13438"),
    paper("AudioLM: a Language Modeling Approach to Audio Generation", "2209.03143"),
    paper("SPEAR-TTS: Speak, Read and Prompt", "2302.03540"),
    paper("Neural Codec Language Models are Zero-Shot Text to Speech Synthesizers（VALL-E）", "2301.02111"),
    paper("Robust Speech Recognition via Large-Scale Weak Supervision（Whisper）", "2212.04356"),
    paper("Moshi: a speech-text foundation model for real-time dialogue", "2410.00037"),
  ],
  "7.5": [
    paper("Chain-of-Thought Prompting Elicits Reasoning in Large Language Models", "2201.11903"),
    paper("Self-Consistency Improves Chain of Thought Reasoning in Language Models", "2203.11171"),
    paper("Training Verifiers to Solve Math Word Problems", "2110.14168"),
    paper("Let's Verify Step by Step（过程监督）", "2305.20050"),
    paper("Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters", "2408.03314"),
    paper("Large Language Monkeys: Scaling Inference Compute with Repeated Sampling", "2407.21787"),
    paper("s1: Simple test-time scaling", "2501.19393"),
    paper("DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning", "2501.12948"),
  ],
};
