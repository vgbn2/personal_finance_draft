from __future__ import annotations

import tkinter as tk
from datetime import date
from tkinter import messagebox, ttk

from . import config
from . import db
from .ai_client import generate_ai_reflection
from .models import DayEntry
from .utils import average_day_score, degree_progress_delta


class LifeTrackerApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Life Tracker")

        db.init_db()

        self._build_ui()
        self._load_today_or_empty()
        self._refresh_history()
        self._refresh_stats()

    def _build_ui(self) -> None:
        self.root.geometry("950x650")

        main_frame = ttk.Frame(self.root, padding=12)
        main_frame.pack(fill=tk.BOTH, expand=True)
        main_frame.columnconfigure(0, weight=3)
        main_frame.columnconfigure(1, weight=2)

        form_frame = ttk.LabelFrame(main_frame, text="Daily entry", padding=10)
        form_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 8), pady=(0, 8))
        right_frame = ttk.LabelFrame(main_frame, text="History & stats", padding=10)
        right_frame.grid(row=0, column=1, sticky="nsew", pady=(0, 8))

        # Date and numeric inputs
        date_row = ttk.Frame(form_frame)
        date_row.pack(fill=tk.X, pady=(0, 6))

        ttk.Label(date_row, text="Date (YYYY-MM-DD):").pack(side=tk.LEFT, padx=(0, 4))
        self.date_var = tk.StringVar()
        self.date_entry = ttk.Entry(date_row, textvariable=self.date_var, width=15)
        self.date_entry.pack(side=tk.LEFT, padx=(0, 16))

        ttk.Label(date_row, text="Day score").pack(side=tk.LEFT, padx=(0, 4))
        self.score_var = tk.StringVar()
        score_values = [str(i) for i in range(config.SCORES.min_score, config.SCORES.max_score + 1, 5)]
        self.score_combo = ttk.Combobox(
            date_row,
            textvariable=self.score_var,
            values=score_values,
            width=6,
        )
        self.score_combo.pack(side=tk.LEFT, padx=(0, 16))

        ttk.Label(date_row, text="Energy (1-5)").pack(side=tk.LEFT, padx=(0, 4))
        self.energy_var = tk.StringVar()
        energy_values = [
            "1 - depleted",
            "2 - low",
            "3 - okay",
            "4 - good",
            "5 - great",
        ]
        self.energy_combo = ttk.Combobox(
            date_row,
            textvariable=self.energy_var,
            values=energy_values,
            width=10,
        )
        self.energy_combo.pack(side=tk.LEFT, padx=(0, 16))

        ttk.Label(date_row, text="Degree %").pack(side=tk.LEFT, padx=(0, 4))
        self.degree_var = tk.StringVar()
        self.degree_entry = ttk.Entry(date_row, textvariable=self.degree_var, width=6)
        self.degree_entry.pack(side=tk.LEFT)

        # Text areas
        def make_labeled_text(parent: ttk.Frame, label: str) -> tk.Text:
            frame = ttk.Frame(parent)
            frame.pack(fill=tk.BOTH, expand=True, pady=(5, 0))
            ttk.Label(frame, text=label).pack(anchor=tk.W)
            text = tk.Text(frame, height=4, wrap=tk.WORD)
            text.pack(fill=tk.BOTH, expand=True)
            return text

        self.learned_text = make_labeled_text(form_frame, "What I learned today")
        self.wins_text = make_labeled_text(
            form_frame, "What I tried / attempted (even if failed)"
        )
        self.struggles_text = make_labeled_text(
            form_frame, "What felt hard or blocked me"
        )

        self.ai_text = make_labeled_text(
            form_frame, "AI reflection / suggestions (Ollama)"
        )

        # Buttons
        button_row = ttk.Frame(form_frame)
        button_row.pack(fill=tk.X, pady=(8, 0))

        save_btn = ttk.Button(button_row, text="Save / Update day", command=self.save)
        save_btn.pack(side=tk.LEFT)

        today_btn = ttk.Button(
            button_row, text="New / Today", command=self._load_today_or_empty
        )
        today_btn.pack(side=tk.LEFT, padx=(8, 0))

        ai_btn = ttk.Button(
            button_row,
            text="Generate AI reflection",
            command=self.generate_ai,
        )
        ai_btn.pack(side=tk.LEFT, padx=(8, 0))

        # History list
        ttk.Label(right_frame, text="Recent days").pack(anchor=tk.W)
        history_frame = ttk.Frame(right_frame)
        history_frame.pack(fill=tk.BOTH, expand=True, pady=(5, 5))

        self.history_list = tk.Listbox(history_frame, height=20)
        self.history_list.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        scrollbar = ttk.Scrollbar(history_frame, orient=tk.VERTICAL, command=self.history_list.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.history_list.config(yscrollcommand=scrollbar.set)

        self.history_list.bind("<<ListboxSelect>>", self._on_history_select)

        # Stats area
        stats_frame = ttk.Frame(right_frame)
        stats_frame.pack(fill=tk.X, pady=(10, 0))

        self.avg_label = ttk.Label(stats_frame, text="Average (7d): -")
        self.avg_label.pack(anchor=tk.W)

        self.degree_label = ttk.Label(stats_frame, text="Degree: -")
        self.degree_label.pack(anchor=tk.W)

        # Keyboard shortcut
        self.root.bind("<Control-s>", lambda event: self.save())

    def _load_today_or_empty(self) -> None:
        today_str = date.today().strftime("%Y-%m-%d")
        self._load_by_date(today_str, create_if_missing=True)

    def _load_by_date(self, date_str: str, create_if_missing: bool = False) -> None:
        self.date_var.set(date_str)
        entry = db.get_day_entry_by_date(date_str)
        if entry is None and not create_if_missing:
            messagebox.showinfo("Not found", f"No entry for {date_str}")
            return

        if entry is None:
            # Empty defaults
            self.learned_text.delete("1.0", tk.END)
            self.wins_text.delete("1.0", tk.END)
            self.struggles_text.delete("1.0", tk.END)
            self.ai_text.delete("1.0", tk.END)
            self.score_var.set("70")
            self.energy_var.set("3 - okay")
            self.degree_var.set("")
        else:
            self.learned_text.delete("1.0", tk.END)
            self.learned_text.insert(tk.END, entry.learned)

            self.wins_text.delete("1.0", tk.END)
            self.wins_text.insert(tk.END, entry.wins)

            self.struggles_text.delete("1.0", tk.END)
            self.struggles_text.insert(tk.END, entry.struggles)

            self.ai_text.delete("1.0", tk.END)
            if entry.ai_reflection:
                self.ai_text.insert(tk.END, entry.ai_reflection)

            self.score_var.set(str(entry.day_score))
            # For energy, keep the numeric part in sync with the labelled dropdown.
            self.energy_var.set(f"{entry.energy} - " + {
                1: "depleted",
                2: "low",
                3: "okay",
                4: "good",
                5: "great",
            }.get(entry.energy, "okay"))
            self.degree_var.set(
                "" if entry.degree_progress_pct is None else f"{entry.degree_progress_pct:.1f}"
            )

    def _on_history_select(self, _event: object) -> None:
        sel = self.history_list.curselection()
        if not sel:
            return
        idx = sel[0]
        value = self.history_list.get(idx)
        date_str = value.split("|", 1)[0].strip()
        self._load_by_date(date_str, create_if_missing=False)

    def _refresh_history(self) -> None:
        self.history_list.delete(0, tk.END)
        for entry in db.get_recent_days(limit=30):
            line = f"{entry.date} | {entry.day_score:3d} | {entry.degree_progress_pct:5.1f}%"
            self.history_list.insert(tk.END, line)

    def _refresh_stats(self) -> None:
        recent = db.get_recent_days(limit=7)
        avg = average_day_score(recent)
        self.avg_label.config(text=f"Average (7d): {avg:.1f}")

        trend = db.get_degree_trend(days_back=30)
        if not trend:
            self.degree_label.config(text="Degree: -")
        else:
            latest_pct = trend[-1][1]
            delta = degree_progress_delta(trend)
            self.degree_label.config(
                text=f"Degree: {latest_pct:.1f}% (Δ {delta:+.1f}% vs 30d)"
            )

    def save(self) -> None:
        date_str = self.date_var.get().strip()
        if not date_str:
            messagebox.showerror("Validation error", "Date is required.")
            return

        learned = self.learned_text.get("1.0", tk.END).strip()
        wins = self.wins_text.get("1.0", tk.END).strip()
        struggles = self.struggles_text.get("1.0", tk.END).strip()
        ai_reflection = self.ai_text.get("1.0", tk.END).strip()

        try:
            score = int(self.score_var.get())
        except ValueError:
            messagebox.showerror("Validation error", "Day score must be an integer.")
            return

        if not (config.SCORES.min_score <= score <= config.SCORES.max_score):
            messagebox.showerror(
                "Validation error",
                f"Day score must be between {config.SCORES.min_score} and {config.SCORES.max_score}.",
            )
            return

        try:
            # energy dropdown is like "3 - okay", so take the first token
            energy_raw = self.energy_var.get().strip()
            energy = int(energy_raw.split(" ", 1)[0])
        except (ValueError, IndexError):
            messagebox.showerror("Validation error", "Energy must start with a number 1-5.")
            return

        if not (config.SCORES.min_energy <= energy <= config.SCORES.max_energy):
            messagebox.showerror(
                "Validation error",
                f"Energy must be between {config.SCORES.min_energy} and {config.SCORES.max_energy}.",
            )
            return

        degree_str = self.degree_var.get().strip()
        if degree_str:
            try:
                degree_pct = float(degree_str)
            except ValueError:
                messagebox.showerror(
                    "Validation error", "Degree % must be a number if provided."
                )
                return
            if not (
                config.SCORES.min_degree_pct <= degree_pct <= config.SCORES.max_degree_pct
            ):
                messagebox.showerror(
                    "Validation error",
                    f"Degree % must be between {config.SCORES.min_degree_pct} and {config.SCORES.max_degree_pct}.",
                )
                return
        else:
            degree_pct = 0.0

        existing = db.get_day_entry_by_date(date_str)
        if existing is None:
            entry = DayEntry.new(
                date=date_str,
                learned=learned,
                wins=wins,
                struggles=struggles,
                day_score=score,
                energy=energy,
                degree_progress_pct=degree_pct,
            )
        else:
            entry = DayEntry(
                id=existing.id,
                date=date_str,
                learned=learned,
                wins=wins,
                struggles=struggles,
                day_score=score,
                energy=energy,
                degree_progress_pct=degree_pct,
                ai_reflection=existing.ai_reflection,
                created_at=existing.created_at,
                updated_at=existing.updated_at,
            )

        # Overwrite AI reflection from the UI (even if empty).
        entry.ai_reflection = ai_reflection

        try:
            db.upsert_day_entry(entry)
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("Database error", str(exc))
            return

        self._refresh_history()
        self._refresh_stats()
        messagebox.showinfo("Saved", "Day saved successfully.")

    def generate_ai(self) -> None:
        """
        Generate an AI reflection for the current form using local Ollama.
        """
        date_str = self.date_var.get().strip()
        if not date_str:
            messagebox.showerror("Validation error", "Set a date before generating AI.")
            return

        # Save current form first so DB is in sync.
        self.save()

        entry = db.get_day_entry_by_date(date_str)
        if entry is None:
            messagebox.showerror(
                "Error", "Could not load entry after save to generate AI."
            )
            return

        try:
            reflection = generate_ai_reflection(entry)
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("AI error", str(exc))
            return

        self.ai_text.delete("1.0", tk.END)
        self.ai_text.insert(tk.END, reflection)

        # Persist updated reflection.
        entry.ai_reflection = reflection
        try:
            db.upsert_day_entry(entry)
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("Database error", str(exc))
            return

        messagebox.showinfo("AI reflection", "AI reflection generated and saved.")


def main() -> None:
    root = tk.Tk()
    LifeTrackerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()

