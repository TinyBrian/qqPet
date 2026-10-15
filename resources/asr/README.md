# 语音识别模型（不随仓库分发）

语音对话功能（说话键）需要两个 sherpa-onnx 模型放在这里，**不放也能正常运行其它功能**：模型缺失时设置页会提示，语音开关可继续保留。

按下面的目录放置（文件名需一致）：

```
resources/asr/
├── paraformer-zh-2025-10-07/
│   ├── model.int8.onnx      # 约 228 MB
│   └── tokens.txt
└── punct-ct-transformer/
    ├── model.onnx           # 约 285 MB
    └── tokens.json
```

## 下载

- 识别（Paraformer-zh int8，2025-10-07）：
  `https://huggingface.co/csukuangfj/sherpa-onnx-paraformer-zh-int8-2025-10-07/resolve/main/`
  国内镜像：把域名换成 `hf-mirror.com` 即可，需要 `model.int8.onnx` 与 `tokens.txt`。
- 标点（CT-Transformer，可选；不放则识别结果无标点）：
  `https://huggingface.co/csukuangfj/sherpa-onnx-punct-ct-transformer-zh-en-vocab272727-2024-04-12/resolve/main/`
  需要 `model.onnx`（改名放置）与 `tokens.json`。

两个模型分别来自 FunASR/SpeechColab 与 FunASR 的开源发布，许可见各自仓库。
