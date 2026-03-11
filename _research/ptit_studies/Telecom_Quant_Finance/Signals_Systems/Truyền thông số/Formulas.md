# 🧮 Formulas for Truyền thông số

- **Nyquist Rate**: $$f_s >= 2f_max$$ - Sampling frequency must be at least twice the highest frequency component of the signal.

- **Nyquist Theorem**: $$S = B * log2(N)$$ - Determines the maximum data rate for a signal based on bandwidth and number of samples.

- **Nyquist-Hartley Theorem**: $$sin 2 / 2$$ - Relates the maximum data rate for reliable transmission through a finite bandwidth channel using amplitude modulation.

- **Wavelength**: $$λ = c/f$$ - Relationship between wavelength (λ), speed of light (c), and frequency (f).

- **Antenna Size**: $$λ > 1/10 λ_0$$ - Antenna length must be greater than 1/10 of the wavelength for efficient radiation.

- **Độ thâm nhập**: $$250 / f  $$ - Độ thâm nhập () của sóng trong nước, f là tần số.

- **Suy hao**: $$0.003dB/km (10GHz)$$ - Suy hao tín hiệu ở tần số 10GHz do mưa nhỏ.

- **Công thức Doppler**: $$mf = f(v/c)$$ - Lượng dịch tần Doppler tỉ lệ thuận với vận tốc (v) của nguồn phát và vận tốc ánh sáng (c).

- **Công thức (1.7)**: $$  *r t s t c t n t c t s t d n t   

- **Trị trung bình của tín hiệu**: $$     

- **Trị trung bình của tín hiệu tuần hoàn**: $$    

- **Boltzmann Constant**: $$K = 1.3803 	imes 10^{-23} J/K$$ - Hằng số Boltzman, liên quan đến nhiệt độ và tạp âm nhiệt.

- **Linear System**: $$y = a*x$$ - Phản ứng của một hệ thống tuyến tính, với y là đầu ra và x là đầu vào.

- **Integral Representation of Impulse Response**: $$y(t) = ∫[from -∞ to ∞] x(τ)h(t-τ) dτ$$ - Represents the output y(t) as the integral of the input signal x(τ) convolved with the impulse response h(t-τ)

- **Định lý Wiener-Kintchine**: $$yy hh xxR R * R  $$ - Định lý này liên hệ giữa hàm tƣơng quan và hàm tự tƣơng quan của tín hiệu.

- **SPq**: $$2

- **Equation 3.19**: $$q_s s x nT$$ - Represents the quantization value of the signal.

- **Phương trình sai số**: $$sgn(q) * se(nTs) = Δ$$ - Mối quan hệ giữa sai số, dấu của sai số và bước lượng tử hóa.

- **Error Prediction**: $$s_y nT = -s_x nT$$ - The predicted value of the sample (s_y nT) is considered as the prediction error value.

- **PCM**: $$s = f_s * N$$ - Tốc độ lấy mẫu (s) bằng tốc độ lấy mẫu tín hiệu vào (f_s) nhân với số lượng bit trung bình (N).

- **Tần số Nyquist**: $$f_N = 2 * f_s$$ - Tần số Nyquist bằng hai lần tần số lấy mẫu.

- **Độ rộng băng thông**: $$B = 2 * f_N$$ - Độ rộng băng thông cần thiết để truyền một tín hiệu bằng hai lần tần số Nyquist.

- **Fourier Transform**: $$x(t) = ∫x(t) * e^{-j2πft} dt$$ - The Fourier Transform decomposes a time-domain signal x(t) into its constituent frequencies.

- **Orthogonality (Frequency)**: $$∫ f(t) * g*(t) dt = 0$$ - The orthogonality of signals in FDM is defined by the integral of their respective waveforms being zero, ensuring minimal interference.

- **Định lý Lấy mẫu**: $$TS = 1/ fS$$ - Chu kỳ lấy mẫu (TS) bằng nghịch đảo tần số lấy mẫu (fS).

- **Khoảng cách xung PAM**: $$TS/ 3$$ - Khoảng cách giữa các xung PAM trong hệ thống TDM-PAM là một phần ba của chu kỳ lấy mẫu.

- **FDMA**: $$B Hz được chia thành n b ng con, mỗi b ng con có độ rộng B/n Hz$$ - Phân chia băng thông thành các kênh riêng biệt cho mỗi user dựa trên tần số.

- **Tốc độ truyền tin (Kbps)**: $$Rb = (Số bit) / (Thời gian truyền)$$ - Tốc độ truyền tin được tính bằng số bit truyền trong một giây.

- **Tốc độ tín hiệu (baud)**: $$RB = (Số mức) / (Thời gian một mức)$$ - Tốc độ tín hiệu (baud) là số lượng mức tín hiệu được truyền trong một giây.

- **HDB3**: $$N + 1 bit '0' liên tiếp được thay thế bằng một dãy N + 1 chữ số nhị phân đặc biệt.$$ - Định nghĩa nguyên lý tạo mã HDBN, tập trung vào việc thay thế các chuỗi '0' liên tiếp để dễ dàng nhận biết.

- **Spectrum Width Formula**: $$P(ω) = (Rb/2) * sin(ω(t/T))$$ - Bề rộng phổ của xung p(t) phụ thuộc vào tần số Rb và thời gian mẫu T.

- **Pha của xung M-PSK**: $$i = 2i/M  với i   0, 1, 2, ..., M-1$$ - Pha của xung lân cận khác nhau 2/M.

- **2log2(bR/B**: $$2log2(bR/B$$ - Hiệu suất sử dụng b ng thông của kênh truyền tín hiệu M-PSK

- **Error Probability Formula**: $$P_e = rac{1}{kM} 	ext{exp}(-rac{kM}{N}) 	ext{k} 	ext{M} 	ext{kEP} 	ext{k} 	ext{k} 	ext{k} 	ext{k} 	ext{N}$$ - Formula for the probability of error in M-FSK.

- **Bandwidth Requirement**: $$B = rac{2MB}{T}$$ - Formula for the required bandwidth for M-FSK transmission.