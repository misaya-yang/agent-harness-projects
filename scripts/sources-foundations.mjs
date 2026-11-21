const direct = (label, url) => ({ label, url, kind: "direct" });
const paper = (label, id) => direct(label, `https://arxiv.org/abs/${id}`);

// M0 math foundations. Classic results come with the original paper or a free textbook chapter.
export default {
  "0.1": [
    direct("Eckart & Young · The Approximation of One Matrix by Another of Lower Rank（Psychometrika 1936）", "https://doi.org/10.1007/BF02288367"),
    paper("Hu et al. · LoRA: Low-Rank Adaptation of Large Language Models", "2106.09685"),
    paper("Aghajanyan et al. · Intrinsic Dimensionality Explains the Effectiveness of Language Model Fine-Tuning", "2012.13255"),
    paper("DeepSeek-AI · DeepSeek-V2（多头潜注意力 MLA）", "2405.04434"),
    paper("Liu et al. · Muon is Scalable for LLM Training", "2502.16982"),
    direct("Gilbert Strang · Linear Algebra and Learning from Data（MIT）", "https://math.mit.edu/~gs/learningfromdata/"),
  ],
  "0.2": [
    direct("Rumelhart, Hinton & Williams · Learning representations by back-propagating errors（Nature 1986）", "https://www.nature.com/articles/323533a0"),
    paper("Baydin et al. · Automatic Differentiation in Machine Learning: a Survey", "1502.05767"),
    paper("Chen et al. · Training Deep Nets with Sublinear Memory Cost（activation checkpointing）", "1604.06174"),
    direct("Andrej Karpathy · micrograd：百行实现的标量自动微分引擎", "https://github.com/karpathy/micrograd"),
  ],
  "0.3": [
    paper("Evan Miller · Adding Error Bars to Evals: A Statistical Approach to Language Model Evaluations", "2411.00640"),
    direct("Art B. Owen · Monte Carlo theory, methods and examples（第 2 章：大数定律与中心极限定理）", "https://artowen.su.domains/mc/"),
  ],
  "0.4": [
    paper("Kingma & Welling · Auto-Encoding Variational Bayes（重参数化技巧）", "1312.6114"),
    paper("Ho, Jain & Abbeel · Denoising Diffusion Probabilistic Models（q(x_t|x_0) 的闭式解）", "2006.11239"),
    paper("Nichol & Dhariwal · Improved Denoising Diffusion Probabilistic Models（余弦噪声调度）", "2102.09672"),
  ],
  "0.5": [
    direct("Claude Shannon · A Mathematical Theory of Communication（1948）", "https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf"),
    paper("Hinton, Vinyals & Dean · Distilling the Knowledge in a Neural Network（温度与软标签）", "1503.02531"),
    paper("Holtzman et al. · The Curious Case of Neural Text Degeneration（温度与 top-p 采样）", "1904.09751"),
  ],
  "0.6": [
    paper("Kingma & Ba · Adam: A Method for Stochastic Optimization", "1412.6980"),
    paper("Loshchilov & Hutter · Decoupled Weight Decay Regularization（AdamW）", "1711.05101"),
    direct("Sutskever et al. · On the importance of initialization and momentum in deep learning（ICML 2013）", "https://proceedings.mlr.press/v28/sutskever13.html"),
    direct("Gabriel Goh · Why Momentum Really Works（Distill 2017）", "https://distill.pub/2017/momentum/"),
    paper("Zhang et al. · Why Transformers Need Adam: A Hessian Perspective", "2402.16788"),
    paper("Cohen et al. · Gradient Descent on Neural Networks Typically Occurs at the Edge of Stability", "2103.00065"),
    paper("McCandlish et al. · An Empirical Model of Large-Batch Training（临界 batch size）", "1812.06162"),
    paper("Goyal et al. · Accurate, Large Minibatch SGD（线性缩放规则）", "1706.02677"),
    paper("Touvron et al. · LLaMA: Open and Efficient Foundation Language Models（AdamW 配方）", "2302.13971"),
  ],
  "0.7": [
    direct("Aapo Hyvärinen · Estimation of Non-Normalized Statistical Models by Score Matching（JMLR 2005）", "https://jmlr.org/papers/v6/hyvarinen05a.html"),
    direct("Welling & Teh · Bayesian Learning via Stochastic Gradient Langevin Dynamics（ICML 2011）", "https://www.stats.ox.ac.uk/~teh/research/compstats/WelTeh2011a.pdf"),
    paper("Song & Ermon · Generative Modeling by Estimating Gradients of the Data Distribution（退火 Langevin）", "1907.05600"),
    paper("Song et al. · Score-Based Generative Modeling through Stochastic Differential Equations", "2011.13456"),
    direct("Art B. Owen · Monte Carlo theory, methods and examples（第 9 章：重要性采样）", "https://artowen.su.domains/mc/"),
  ],
  "0.8": [
    paper("Kingma & Welling · Auto-Encoding Variational Bayes", "1312.6114"),
    paper("Blei, Kucukelbir & McAuliffe · Variational Inference: A Review for Statisticians", "1601.00670"),
    paper("Lucas et al. · Don't Blame the ELBO! A Linear VAE Perspective on Posterior Collapse", "1911.02469"),
    paper("Burgess et al. · Understanding disentangling in β-VAE", "1804.03599"),
    paper("Ho, Jain & Abbeel · Denoising Diffusion Probabilistic Models（扩散的 ELBO 与简化损失）", "2006.11239"),
    paper("Kingma et al. · Variational Diffusion Models", "2107.00630"),
    paper("Rombach et al. · High-Resolution Image Synthesis with Latent Diffusion Models", "2112.10752"),
  ],
  "0.9": [
    paper("Song et al. · Score-Based Generative Modeling through Stochastic Differential Equations", "2011.13456"),
    direct("Brian D. O. Anderson · Reverse-time diffusion equation models（Stochastic Processes and their Applications 1982）", "https://doi.org/10.1016/0304-4149(82)90051-5"),
    direct("Särkkä & Solin · Applied Stochastic Differential Equations（免费书稿）", "https://users.aalto.fi/~asolin/sde-book/sde-book.pdf"),
    paper("Song, Meng & Ermon · Denoising Diffusion Implicit Models", "2010.02502"),
    paper("Lu et al. · DPM-Solver: A Fast ODE Solver for Diffusion Probabilistic Model Sampling in Around 10 Steps", "2206.00927"),
    paper("Karras et al. · Elucidating the Design Space of Diffusion-Based Generative Models（EDM）", "2206.00364"),
    paper("Lipman et al. · Flow Matching for Generative Modeling", "2210.02747"),
  ],
};
