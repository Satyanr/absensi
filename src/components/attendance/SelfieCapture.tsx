"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

type SelfieSource = "WEB_CAMERA" | "WEB_FILE_CAPTURE";

type SelfieCaptureProps = {
  onCapture: (file: File | null, source?: SelfieSource) => void;
};

export default function SelfieCapture({ onCapture }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());

      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  }

  function clearPreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(null);
    onCapture(null);
  }

  async function openCamera() {
    setError("");
    setLoading(true);
    clearPreview();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("CAMERA_UNAVAILABLE");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "user",
          },

          width: {
            ideal: 1280,
          },

          height: {
            ideal: 720,
          },
        },

        audio: false,
      });

      streamRef.current = stream;

      if (!videoRef.current) {
        throw new Error("VIDEO_NOT_READY");
      }

      videoRef.current.srcObject = stream;

      await videoRef.current.play();

      setCameraActive(true);
    } catch (cameraError) {
      console.error(cameraError);

      stopCamera();

      if (
        cameraError instanceof DOMException &&
        cameraError.name === "NotAllowedError"
      ) {
        setError(
          "Izin kamera ditolak. Gunakan tombol Ambil Foto Manual di bawah atau izinkan kamera dari pengaturan browser.",
        );
      } else {
        setError(
          "Live camera tidak dapat digunakan. Gunakan Ambil Foto Manual.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;

    if (!video) {
      setError("Preview kamera tidak tersedia.");
      return;
    }

    if (!video.videoWidth || !video.videoHeight) {
      setError("Kamera belum siap. Coba beberapa saat lagi.");
      return;
    }

    const canvas = document.createElement("canvas");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setError("Gagal memproses foto.");
      return;
    }

    /*
     * Mirror selfie supaya hasil foto sesuai preview kamera depan.
     */
    context.translate(canvas.width, 0);
    context.scale(-1, 1);

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Gagal membuat file foto.");
          return;
        }

        const file = new File([blob], `selfie-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });

        const url = URL.createObjectURL(file);

        setPreviewUrl(url);
        onCapture(file, "WEB_CAMERA");

        stopCamera();
      },

      "image/jpeg",
      0.85,
    );
  }

  function handleFallbackFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    stopCamera();
    clearPreview();

    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar.");
      event.target.value = "";
      return;
    }

    const maxBytes = 5 * 1024 * 1024;

    if (file.size > maxBytes) {
      setError("Ukuran foto maksimal 5 MB.");
      event.target.value = "";
      return;
    }

    const url = URL.createObjectURL(file);

    setPreviewUrl(url);
    onCapture(file, "WEB_FILE_CAPTURE");

    event.target.value = "";
  }

  useEffect(() => {
    return () => {
      stopCamera();

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div>
      <h2 className="font-semibold">Selfie</h2>

      {!previewUrl && !cameraActive && (
        <p className="mt-2 text-sm text-neutral-500">
          Ambil selfie untuk bukti absensi.
        </p>
      )}

      {error && (
        <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={
            cameraActive
              ? "aspect-[3/4] w-full object-cover -scale-x-100"
              : "hidden"
          }
        />
      </div>

      {previewUrl && (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview selfie"
            className="aspect-[3/4] w-full rounded-xl object-cover"
          />

          <p className="mt-2 text-sm font-medium text-green-700">
            ✓ Selfie berhasil diambil
          </p>
        </div>
      )}

      {!cameraActive && !previewUrl && (
        <button
          type="button"
          onClick={openCamera}
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-blue-600 py-3 font-medium text-white disabled:opacity-50"
        >
          {loading ? "Membuka Kamera..." : "Buka Kamera"}
        </button>
      )}

      {cameraActive && (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={capturePhoto}
            className="w-full rounded-xl bg-green-600 py-3 font-medium text-white"
          >
            Ambil Foto
          </button>

          <button
            type="button"
            onClick={stopCamera}
            className="w-full rounded-xl border border-neutral-300 py-3 text-sm font-medium"
          >
            Batalkan Kamera
          </button>
        </div>
      )}

      {previewUrl && (
        <button
          type="button"
          onClick={clearPreview}
          className="mt-3 w-full rounded-xl border border-neutral-300 py-3 text-sm font-medium"
        >
          Ambil Ulang Selfie
        </button>
      )}

      <div className="mt-4 border-t border-neutral-200 pt-4">
        <p className="mb-2 text-xs text-neutral-500">
          Jika live camera tidak bekerja:
        </p>

        <label className="block cursor-pointer rounded-xl border border-neutral-300 px-4 py-3 text-center text-sm font-medium">
          Ambil Foto Manual
          <input
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFallbackFile}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}
