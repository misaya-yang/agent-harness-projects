const direct = (label, url) => ({ label, url, kind: "direct" });
const arxiv = (id, label) => direct(label, `https://arxiv.org/abs/${id}`);

export default {
  "5.5": [
    arxiv("2310.06770", "Jimenez et al. · SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"),
    arxiv("2005.11401", "Lewis et al. · Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"),
    arxiv("1707.06347", "Schulman et al. · Proximal Policy Optimization Algorithms"),
    arxiv("2107.03374", "Chen et al. · Evaluating Large Language Models Trained on Code（HumanEval 与 pass@k）"),
    arxiv("2602.07150", "On Randomness in Agentic Evals"),
    direct("Anthropic · Quantifying infrastructure noise in agentic coding evals", "https://www.anthropic.com/research/infrastructure-noise"),
  ],
  "5.6": [
    direct("NVIDIA · CUDA C++ Best Practices Guide", "https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/index.html"),
    direct("Triton · Tutorial: Vector Addition", "https://triton-lang.org/main/getting-started/tutorials/01-vector-add.html"),
    direct("Triton · Tutorial: Fused Softmax", "https://triton-lang.org/main/getting-started/tutorials/02-fused-softmax.html"),
    direct("PyTorch · torch.compile Tutorial", "https://docs.pytorch.org/tutorials/intermediate/torch_compile_tutorial.html"),
    direct("PyTorch · Common Graph Breaks", "https://docs.pytorch.org/docs/stable/compile/programming_model.common_graph_breaks.html"),
    direct("PyTorch · CUDA semantics and asynchronous execution", "https://docs.pytorch.org/docs/stable/notes/cuda.html#asynchronous-execution"),
    arxiv("2205.14135", "Dao et al. · FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness"),
  ],
};
