# 🧮 Formulas for Kỹ thuật Vi xử lý

- **Interrupt Vector Calculation**: $$IV = (Interrupt Vector Number) = (Interrupt Number) - 1$$ - Formula for calculating the interrupt vector number.

- **Baud Rate Calculation**: $$baud rate = 1 / (period time)$$ - Formula for calculating the baud rate.

- **Clock Frequency**: $$f = 1 / T$$ - Frequency is the inverse of the period.

- **ARM Instruction Set**: $$ARM (32-bit)$$ - A 32-bit instruction set used for higher complexity applications.

- **Carry Flag (C)**: $$C = (Result of addition > 2^n - 1)$$ - Indicates a carry bit generated during addition.

- **Interrupt Request (IRQ)**: $$IRQ = Low Signal$$ - Triggers a non-maskable interrupt.

- **Load-Store Cycle**: $$Rd ← Rn * Rm$$ - Represents the fundamental cycle in a load-store architecture where data is loaded from memory into a register (Rd) and then operated upon.

- **Instruction Execution Cycle**: $$Read - Decode - Execute$$ - The fundamental cycle of instruction processing in a processor.

- **Memory Access Cycle**: $$Address Calculation -> Bus Access -> Data Transfer$$ - The process of accessing data in memory, involving address calculation, bus transmission, and data retrieval.

- **SWI Execution Sequence**: $$1. Store return address in LR_svc (R14_svc). 2. Copy CPSR to SPSR_svc. 3. Set Supervisor mode bits in CPSR. 4. Set T=1. 5. Set bit 7 (I) in CPSR to 1.$$ - Sequence of operations performed during a Software Interrupt (SWI) execution.

- **LDR**: $$LDR{cond}{B|SB|H|SH} Rd, [Rn, offset]; Rd = [Rn + offset]$$ - Nạp dữ liệu từ bộ nhớ ngoài vào thanh ghi Rd.

- **STR**: $$STR{cond}{B|SB|H|SH} Rd, [Rn, offset]; [Rn + offset] = Rd$$ - Lưu dữ liệu từ thanh ghi ra ô nhớ ngoài.

- **Mode Switching**: $$BX/BLX$$ - The BX/BLX instruction uses the LSB of the target address to switch between ARM and Thumb modes.

- **Bộ đếm tiến 16 bit**: $$16-bit up-counting timers$$ - Có thể hoạt động như bộ định thời, bộ đếm sự kiện bên ngoài hoặc bộ phát tốc độ Baud.

- **Cổng vào/ra**: $$I/O Ports (P0-P3)$$ - Mỗi cổng có 8 bit độc lập, dùng cho điều khiển đa dạng.

- **ALE Frequency**: $$ALE Frequency = 1.6 * Clock Frequency$$ - Tần số xung ALE bằng 1.6 lần tần số xung dao động trên chip.

- **ROM Access**: $$Level of External Access = 1 -> ROM Internal, Level of External Access = 0 -> External Memory$$ - Mức tín hiệu External Access = 1 -> Thực thi chương trình từ ROM nội, Mức tín hiệu External Access = 0 -> Thực thi chương trình từ bộ nhớ chương trình ngoài.

- **Cờ nhớ CY**: $$CY = 1 nếu có số nhớ sinh ra bởi phép cộng hoặc phép trừ$$ - Cờ này biểu thị sự có mặt của số nhớ trong phép toán.

- **Cờ tràn OV**: $$OV = 1 biểu diễn số âm trong hệ 2's complement$$ - Biểu diễn số âm sử dụng bit cao nhất (MSB) để biểu thị dấu.

- **Địa chỉ 8 bit**: $$8-bit address$$ - Có thể tạo trang bộ nhớ 256 byte khi chỉ có một lượng nhớ dữ liệu ngoài.

- **Địa chỉ được tác động**: $$PC + A$$ - Địa chỉ được tính toán bằng cách cộng địa chỉ cơ sở (PC hoặc DPTR) với offset (A).

- **Địa chỉ nhãn**: $$Địa chỉ được tác động = (PC) hoặc (DPTR) + (A)$$ - Địa chỉ được tính toán bằng cách cộng địa chỉ cơ sở (PC hoặc DPTR) với offset (A).

- **MOVC A,@A+DPTR**: $$MOVC A, @A+DPTR$$ - Chuyển dữ liệu từ bộ nhớ ROM có địa chỉ bằng giá trị của A cộng với DPTR vào thanh ghi A.

- **SJMP**: $$PC = PC + 2 ; PC = PC + offset$$ - Short Jump:  Địa chỉ nhảy được tính bằng cộng byte cuối của lệnh SJMP với địa chỉ tiếp theo lệnh SJMP.

- **AJMP**: $$PC = PC + 2$$ - Absolute Jump:  Tương tự ACALL, chuyển đến địa chỉ tuyệt đối.

- **LJMP**: $$PC = PC + 2 ; PC[10-0] = Add11[10-0]$$ - Long Jump:  Chuyển đến địa chỉ xa, sử dụng giá trị Add16.

- **Mạch chia xung clock**: $$Q_n = Q_{n-1}̅$$ - Mỗi DFF chia đôi tần số xung clock, dẫn đến trạng thái đổi của flipflop.

- **Timer Modes**: $$00: Timer 16-bit Timer Mode$$ - Mode 00: 16-bit Timer Mode

- **Tần số xung vuông**: $$f = 1 / T$$ - Tần số xung vuông được tính bằng chu kỳ xung vuông chia cho chu kỳ.

- **Độ rộng phần cao của xung**: $$ (256-5)*1.085=272.33$$ - Tính toán độ rộng phần cao của xung dựa trên tần số XTAL và thời gian đếm.

- **Timer Mode Selection**: $$TMOD = #01100000B$$ - Specifies the timer mode (mode 2 in this example) and the input source (external via P3.4/P3.5).

- **Speed Baud Setting**: $$TH1,#-6$$ - Chọn tốc độ baud 4800