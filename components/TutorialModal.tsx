"use client";
import { useState } from "react";

const tutorialSteps = [
    {
        title: "Bước 1: Lọc dữ liệu chuẩn",
        image: "/tutorial/step1.png",
        desc: "Truy cập hệ thống điều hành. Bạn cần lọc chính xác các trường: SAP Contract type (car_platform), Order status (Cancelled, Completed) và Vehicle type (Car)."
    },
    {
        title: "Bước 2: Chọn cột và Xuất file (Export)",
        image: "/tutorial/step2.png",
        desc: "Bấm nút Export data. Sau đó tick chọn Tất cả các cột (Select all) để đảm bảo dữ liệu import đầy đủ thông tin nhất."
    },
    {
        title: "Bước 3: Import vào Dashboard",
        image: "/tutorial/step3.png",
        desc: "Trở lại trang Dashboard này, chọn mốc thời gian phù hợp và bấm nút 'Import file' ở góc trên bên phải để đẩy file Excel vừa tải về lên hệ thống."
    }
];

export function TutorialModal({ onClose }: { onClose: () => void }) {
    const [step, setStep] = useState(0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-[90vw] w-full h-[90vh] flex flex-col shadow-2xl relative">

                {/* Header */}
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
                            Hướng dẫn sử dụng
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">
                            {tutorialSteps[step].title} ({step + 1}/{tutorialSteps.length})
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full cursor-pointer">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden min-h-0 flex flex-col md:flex-row gap-6 relative">
                    {/* Image Viewer */}
                    <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl overflow-auto relative group">
                        <div className="absolute inset-0 flex items-center justify-center p-2">
                            <img
                                src={tutorialSteps[step].image}
                                alt={tutorialSteps[step].title}
                                className="max-w-full max-h-full object-contain rounded drop-shadow-lg cursor-zoom-in hover:scale-105 transition-transform duration-300"
                                onClick={() => window.open(tutorialSteps[step].image, '_blank')}
                                title="Click để xem ảnh gốc khổ lớn"
                            />
                        </div>
                    </div>

                    {/* Info Panel */}
                    <div className="w-full md:w-80 shrink-0 flex flex-col">
                        <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-xl flex-1 backdrop-blur">
                            <h3 className="text-lg font-semibold text-white mb-3">{tutorialSteps[step].title}</h3>
                            <p className="text-slate-300 leading-relaxed text-sm">
                                {tutorialSteps[step].desc}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-800 shrink-0">
                    <div className="flex gap-2">
                        {tutorialSteps.map((_, i) => (
                            <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-cyan-500' : 'w-2 bg-slate-700 cursor-pointer'}`} onClick={() => setStep(i)} />
                        ))}
                    </div>
                    <div className="flex gap-3">
                        <button
                            disabled={step === 0}
                            onClick={() => setStep(s => s - 1)}
                            className="px-6 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                        >
                            Quay lại
                        </button>
                        {step === tutorialSteps.length - 1 ? (
                            <button
                                onClick={onClose}
                                className="px-6 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow-lg shadow-cyan-900/50 transition-all"
                            >
                                Đã hiểu, đóng thẻ
                            </button>
                        ) : (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-900/50 transition-all"
                            >
                                Bước tiếp theo
                            </button>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
