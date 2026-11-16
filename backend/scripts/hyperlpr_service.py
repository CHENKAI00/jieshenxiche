/**
 * 本地车牌识别服务（免费、离线、按次 0 费用）
 *
 * 依赖：pip install hyperlpr3 fastapi uvicorn[standard] opencv-python-headless
 * 启动：python3 scripts/hyperlpr_service.py        # 监听 127.0.0.1:18090
 * 后端：backend/.env 设 OCR_ENGINE=hyperlpr（或 auto + HYPERLPR_URL）
 *
 * 原理：hyperlpr3 内部是两阶段
 *   ① 检测：YOLO 系（HYDET）输出车牌框 + 四角关键点
 *   ② 矫正 + 识别：按关键点做透视变换拉正 → CRNN(CNN+BiLSTM+CTC) 直接出字符序列
 * 这里只做 HTTP 包装，把 base64 图 → 车牌号/颜色/置信度 交给 Node 后端。
 */
import base64
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np

try:
    import hyperlpr3 as lpr3
except Exception as e:  # pragma: no cover
    print("未安装 hyperlpr3，请先执行：pip install hyperlpr3", file=sys.stderr)
    raise

CATCHER = lpr3.LicensePlateCatcher()
PORT = 18090


def recognize(img_bgr):
    """返回 [{plate, color, confidence, bbox}]，按置信度倒序"""
    results = []
    for item in CATCHER(img_bgr):
        # hyperlpr3 返回 (车牌号, 置信度, 类型索引, 框[, 关键点])
        plate = str(item[0])
        conf = float(item[1])
        type_idx = int(item[2]) if len(item) > 2 and item[2] is not None else 0
        box = item[3] if len(item) > 3 else None
        color = {0: "蓝", 1: "黄", 2: "绿", 3: "白", 4: "黑"}.get(type_idx, "")
        results.append({
            "plate": plate,
            "confidence": round(conf, 4),
            "color": color,
            "bbox": [int(v) for v in np.array(box).flatten()[:4]] if box is not None else [],
        })
    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True, "engine": "hyperlpr3"})
        self._json(404, {"ok": False, "msg": "not found"})

    def do_POST(self):
        if self.path != "/recognize":
            return self._json(404, {"ok": False, "msg": "not found"})
        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            raw = base64.b64decode(payload.get("image", ""))
            img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                return self._json(400, {"ok": False, "msg": "图片解码失败"})
            self._json(200, {"ok": True, "results": recognize(img)})
        except Exception as e:
            self._json(500, {"ok": False, "msg": str(e)})


if __name__ == "__main__":
    print(f"HyperLPR3 识别服务: http://127.0.0.1:{PORT}  (POST /recognize)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
