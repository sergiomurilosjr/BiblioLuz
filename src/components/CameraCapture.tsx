import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Camera, X, Check, RefreshCw, Upload, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { compressCoverImage } from '../lib/imageUtils';

interface CameraCaptureProps {
  onCapture: (imageSrc: string) => void;
  onClose: () => void;
}

export const CameraCapture = ({ onCapture, onClose }: CameraCaptureProps) => {
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const capture = useCallback(async () => {
    const rawScreenshot = webcamRef.current?.getScreenshot();
    if (!rawScreenshot) {
      setCameraError('Não foi possível capturar o quadro da câmera. Tente novamente ou envie uma imagem.');
      return;
    }

    setProcessing(true);
    try {
      const compressed = await compressCoverImage(rawScreenshot);
      setImgSrc(compressed);
    } catch {
      setImgSrc(rawScreenshot);
    } finally {
      setProcessing(false);
    }
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessing(true);
    setCameraError(null);
    try {
      const compressed = await compressCoverImage(file);
      setImgSrc(compressed);
    } catch {
      setCameraError('Não foi possível processar a imagem selecionada.');
    } finally {
      setProcessing(false);
    }
  };

  const retake = () => {
    setImgSrc(null);
    setCameraError(null);
  };

  const confirm = () => {
    if (imgSrc) {
      onCapture(imgSrc);
      onClose();
    }
  };

  const videoConstraints: MediaTrackConstraints = {
    width: { ideal: 720 },
    height: { ideal: 960 },
    facingMode: 'environment',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-black overflow-hidden"
    >
      <div className="p-4 flex items-center justify-between text-white z-10 bg-black/40 backdrop-blur-sm">
        <h3 className="font-bold text-base">Fotografar Capa</h3>
        <button
          type="button"
          onClick={onClose}
          className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
          aria-label="Fechar câmera"
        >
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center bg-zinc-900 overflow-hidden">
        {!imgSrc ? (
          cameraError ? (
            <div className="max-w-sm mx-auto p-6 text-center space-y-4 text-white">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <AlertCircle size={28} />
              </div>
              <p className="text-sm font-medium text-zinc-200 leading-relaxed">
                {cameraError}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors"
              >
                <Upload size={18} />
                <span>Escolher ou Tirar Foto pelo Dispositivo</span>
              </button>
            </div>
          ) : (
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.85}
              videoConstraints={videoConstraints}
              className="h-full w-full object-cover"
              mirrored={false}
              disablePictureInPicture={true}
              forceScreenshotSourceSize={false}
              imageSmoothing={true}
              onUserMedia={() => {}}
              onUserMediaError={() =>
                setCameraError(
                  'Câmera indisponível ou permissão negada neste navegador. Você pode enviar uma foto da capa diretamente do seu dispositivo.'
                )
              }
            />
          )
        ) : (
          <img src={imgSrc} alt="Prévia da capa capturada" className="h-full w-full object-contain bg-black" />
        )}

        {/* Visual Guide Overlay (Book shape) */}
        {!imgSrc && !cameraError && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-10">
            <div className="w-full max-w-xs aspect-[3/4.2] border-2 border-white/50 border-dashed rounded-lg flex items-center justify-center">
              <span className="text-white/70 font-bold uppercase tracking-widest text-[10px] bg-black/40 px-3 py-1 rounded">
                Posicione a capa aqui
              </span>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div className="p-6 pb-10 flex items-center justify-center gap-8 bg-black/70 backdrop-blur-md">
        {!imgSrc ? (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={processing}
              className="w-12 h-12 bg-white/10 border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all"
              title="Enviar foto da galeria"
            >
              <Upload size={20} />
            </button>
            {!cameraError && (
              <button
                type="button"
                onClick={capture}
                disabled={processing}
                className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-black shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                title="Capturar foto"
              >
                {processing ? <Loader2 size={28} className="animate-spin" /> : <Camera size={30} />}
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={retake}
              className="px-5 h-12 bg-white/10 border border-white/20 rounded-full flex items-center justify-center gap-2 text-white hover:bg-white/20 transition-all text-sm font-semibold"
            >
              <RefreshCw size={18} />
              <span>Refazer</span>
            </button>
            <button
              type="button"
              onClick={confirm}
              className="px-6 h-12 bg-indigo-600 rounded-full flex items-center justify-center gap-2 text-white shadow-xl hover:bg-indigo-500 active:scale-95 transition-all text-sm font-semibold"
            >
              <Check size={20} />
              <span>Usar Foto</span>
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
};
