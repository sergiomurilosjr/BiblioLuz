import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Camera, X, Check, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CameraCaptureProps {
  onCapture: (imageSrc: string) => void;
  onClose: () => void;
}

export const CameraCapture = ({ onCapture, onClose }: CameraCaptureProps) => {
  const webcamRef = useRef<Webcam>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setImgSrc(imageSrc);
    }
  }, [webcamRef]);

  const retake = () => {
    setImgSrc(null);
  };

  const confirm = () => {
    if (imgSrc) {
      onCapture(imgSrc);
      onClose();
    }
  };

  const videoConstraints = {
    width: 720,
    height: 1280,
    facingMode: "environment" // Use back camera on mobile
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col bg-black overflow-hidden"
    >
      <div className="p-4 flex items-center justify-between text-white z-10">
        <h3 className="font-bold">Fotografar Capa</h3>
        <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 relative flex items-center justify-center bg-zinc-900">
        {!imgSrc ? (
          <Webcam
            {...({
              audio: false,
              ref: webcamRef,
              screenshotFormat: "image/jpeg",
              videoConstraints: videoConstraints,
              className: "h-full w-full object-cover",
              mirrored: false
            } as any)}
          />
        ) : (
          <img src={imgSrc} alt="Preview" className="h-full w-full object-cover" />
        )}
        
        {/* Visual Guide Overlay (Book shape) */}
        {!imgSrc && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-12">
            <div className="w-full h-full max-w-sm max-h-[70vh] border-2 border-white/50 border-dashed rounded-lg flex items-center justify-center">
              <span className="text-white/50 font-bold uppercase tracking-widest text-[10px]">Posicione o livro aqui</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-8 pb-12 flex items-center justify-center gap-12 bg-black/50 backdrop-blur-md">
        {!imgSrc ? (
          <button 
            onClick={capture}
            className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-black shadow-xl hover:scale-110 active:scale-95 transition-all"
          >
            <Camera size={32} />
          </button>
        ) : (
          <>
            <button 
              onClick={retake}
              className="w-14 h-14 bg-white/10 border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all"
            >
              <RefreshCw size={24} />
            </button>
            <button 
              onClick={confirm}
              className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-110 active:scale-95 transition-all"
            >
              <Check size={32} />
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
};
