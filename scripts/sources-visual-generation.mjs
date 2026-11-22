const paper = (label, id) => ({ label, url: `https://arxiv.org/abs/${id}`, kind: "direct" });
const direct = (label, url) => ({ label, url, kind: "direct" });

export default {
  "4.4": [
    paper("Scalable Diffusion Models with Transformers（DiT）", "2212.09748"),
    paper("Scaling Rectified Flow Transformers for High-Resolution Image Synthesis（SD3 / MM-DiT）", "2403.03206"),
    paper("High-Resolution Image Synthesis with Latent Diffusion Models", "2112.10752"),
    paper("All are Worth Words: A ViT Backbone for Diffusion Models（U-ViT）", "2209.12152"),
    direct("Black Forest Labs · FLUX.1-dev 模型卡", "https://huggingface.co/black-forest-labs/FLUX.1-dev"),
  ],
  "4.5": [
    paper("Auto-Encoding Variational Bayes（VAE）", "1312.6114"),
    paper("High-Resolution Image Synthesis with Latent Diffusion Models", "2112.10752"),
    paper("Neural Discrete Representation Learning（VQ-VAE）", "1711.00937"),
    paper("Taming Transformers for High-Resolution Image Synthesis（VQGAN）", "2012.09841"),
    paper("Finite Scalar Quantization: VQ-VAE Made Simple", "2309.15505"),
    paper("Understanding disentangling in β-VAE", "1804.03599"),
  ],
  "4.6": [
    paper("Video Diffusion Models", "2204.03458"),
    paper("Is Space-Time Attention All You Need for Video Understanding?（TimeSformer）", "2102.05095"),
    paper("Photorealistic Video Generation with Diffusion Models（W.A.L.T.）", "2312.06662"),
    paper("Genie: Generative Interactive Environments", "2402.15391"),
    paper("Mastering Diverse Domains through World Models（DreamerV3）", "2301.04104"),
    direct("OpenAI · Video generation models as world simulators", "https://openai.com/index/video-generation-models-as-world-simulators/"),
  ],
};
