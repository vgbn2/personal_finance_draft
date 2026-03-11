# 🧮 Formulas for Xử lý tiếng nói

- **SPL Calculation**: $$SPL = 20 * log10(rmsP/P0)$$ - Calculates SPL based on the root mean square pressure (rmsP) and reference pressure (P0).

- **SIL Calculation**: $$SIL = 10 * log10(I/I0)$$ - Calculates SIL based on sound intensity (I) and reference intensity (I0).

- **Ngƣỡng nghe tuyệt đối**: $$43)3.31000/f(6.08.0$$ - Công thức ước tính ngƣỡng nghe tuyệt đối dựa trên tần số (f).

- **Mối quan hệ Bark-Hz**: $$7500/ftan((a5.3)f00076.0tan(a13Bark 2 )39.690b56.52b/(52548]Hz[W 2 $$ - Công thức liên hệ giữa thang tần Hz và Bark.

- **Mối quan hệ Mel-Hz**: $$f1(log2595]Mel[m 10  )110(700]Hz[f 2595/m $$ - Công thức liên hệ giữa thang tần Mel và Hz.

- **Fourier Transform**: $$X(f) = ∫ x(t) * e^(-j2πft) dt$$ - The Fourier Transform decomposes a time-domain signal x(t) into its frequency components X(f).

- **Năng lượng phân đoạn tín hiệu**: $$

- **Năng lượng ngắn hạn (mở rộng)**: $$_{m=-∞}^{∞} _{n=-∞}^{∞} (mn)^2 E[s(m,n)]$$ - Công thức tính năng lƣợng ngắn hạn, với chỉ số n chạy trên trục các mẫu tại những vị trí mà chúng ta quan tâm đến giá trị năng lƣợng ngắn hạn.

- **Windowed Spectrum**: $$     * w |j j n

- **Z-Transform**: $$Z^{-1} a_n z^{-n}$$ - The inverse Z-transform used in LPC modeling, representing the spectral coefficients.

- **Công thức covariance**: $$n(i,k) =  -$$ - Công thức tính toán covariance dựa trên hàm tự tương quan.

- **STFT**: $$STFT (Short-Time Fourier Transform)$$ - Một công cụ cơ bản để phân tích và tổng hợp tín hiệu tiếng nói, chứa thông tin về formant.

- **Frequency Domain Equation**: $$log(P_{j,r}) = _{n} log(P_{j,r})$$ - Taking the logarithm of the product of harmonics results in the product of harmonics in the logarithmic scale.

- **Compressed Frequency Equation**: $$P_j^\hat{n} = _{j} P_j\omega$$ - The function P_j^\hat{n} is a sum of K compressed frequency bands of |Sn(ej\omega)|.

- **LPC Equation**: $$A = E[x_n] - E[x_{n-m}]$$ - Represents the linear prediction equation, where A is the prediction error, x_n is the current sample, and x_{n-m} is the predicted sample.

- **Formant Frequency**: $$f_k = rac{1}{2	imes 	heta_k}$$ - The frequency of the k-th formant is inversely proportional to the bandwidth (θ_k) of the formant.

- **Sai số lƣợng tử**: $$e_n = s_n^ μ - s_n$$ - Sai số lƣợng tử được định nghĩa là hiệu giữa giá trị tín hiệu lƣợng tử (s_n^ μ) và giá trị tín hiệu gốc (s_n).

- **Công suất nhiễu lƣợng tử**: $$σ^2_e = 2e_n^2$$ - Công suất nhiễu lƣợng tử (σ^2_e) được tính bằng 2 lần bình phương sai số lƣợng tử (e_n^2).

- **DPCM SNR Formula**: $$SNR = 2 * sqrt(max(s/10DPCM, 77.4n/6))$$ - Công thức tính SNR của phương pháp DPCM, sử dụng các biến s (signal power), n (number of samples), và DPCM (differential pulse code modulation).

- **DM Coding**: $$error = current sample - predicted value$$ - Sai số dự đoán trong mã hóa DM là hiệu giữa mẫu hiện tại và giá trị dự đoán từ mẫu trước đó.

- **Lượng tử thích nghi forward**: $$

- **Lượng tử thích nghi backward**: $$

- **Δn**: $$Δn = (1/n) * Δ(n)$$ - Adaptive quantization step, where Δ(n) is the quantization step at time n.

- **SNR**: $$SNR = 2 * (Es/Ne)$$ - Tỷ số tín hiệu trên nhiễu (Signal-to-Noise Ratio) để đánh giá chất lượng tín hiệu.

- **Hanning Window**: $$Hanning(t) = 0.5 * (1 - cos(2πt/T))$$ - Hàm cửa sổ Hanning được sử dụng để giảm thiểu ảnh hưởng của các cạnh tín hiệu trong quá trình tổng hợp.

- **IIR Filter**: $$H(z) = rac{12z^2 + 12z - 1}{z^2 + 12z - 1}$$ - A second-order IIR filter used to generate formants in formant synthesis.

- **w(n)**: $$w(n) (0  n  N-1)$$ - Hàm cửa sổ, với N là độ dài cửa sổ.

- **(n)**: $$(n) = 0.54 * 0.46 * os(0.5n)$$ - Kết quả tự tƣơng quan của mỗi khung tín hiệu sau phép lấy cửa sổ.

- **Công thức (3.30)**: $$ΔN = 3$$ - Hệ số ΔN thường được chọn bằng 3 trong công thức (3.30) để tính toán các hệ số Delta và Delta-Delta.

- **Công thức Bayes**: $$P(w|y) = rac{P(y|w)P(w)}{P(y)}$$ - Sử dụng để ước lượng xác suất của một dãy từ (w) dựa trên dãy véc-tơ âm (y) trong hệ thống nhận dạng.

- **Argmax**: $$argmax_{w} |w y w w|$$ - Tính toán giá trị lớn nhất của hàm |w y w w|.

- **Quan hệ phi tuyến đầu vào đầu ra**: $$w_{ii}y = rac{eta}{1 + e^{-eta x}}$$ - Mối quan hệ giữa đầu vào x và đầu ra y trong một mạng nơ-ron, sử dụng hàm ngưỡng cứng.

- **Pr | X_t x**: $$Pr | X_t x$$ - Xác suất chuyển đổi trạng thái trong quá trình Markov.

- **Transition Probability**: $$Pr[i→j] = ∑_{k=1}^{M} P_{ijk}$$ - Probability of transitioning from state i to state j.

- **Emission Probability**: $$Pr[o_k | i] = P_{ijk}$$ - Probability of observing observation o_k in state i.