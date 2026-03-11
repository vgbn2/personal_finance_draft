import sqlite3
from datetime import datetime

DB_NAME = "life_engine.db"
TOTAL_CREDITS = 150  # Standard engineering curriculum


def init_db() -> None:
    """Initializes the SQLite database with the holistic schema."""
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute(
        """CREATE TABLE IF NOT EXISTS daily_log
                 (date TEXT PRIMARY KEY,
                  code_hours REAL,
                  study_hours REAL,
                  learnings TEXT,
                  failures TEXT,
                  theory_connection TEXT,
                  grade TEXT)"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS degree_progress
                 (updated_at TEXT,
                  credits_earned INTEGER,
                  total_credits INTEGER)"""
    )
    conn.commit()
    conn.close()


def calculate_grade(
    code_hours: float,
    study_hours: float,
    learnings: str,
    failures: str,
    theory: str,
) -> str:
    """Calculates a strict, objective grade based on effort and synthesis."""
    score = 0
    total_hours = code_hours + study_hours

    # 1. Base Effort
    if total_hours >= 6:
        score += 30
    elif total_hours >= 3:
        score += 15

    # 2. Balance Constraint (Must do both)
    if code_hours > 0 and study_hours > 0:
        score += 20

    # 3. Reflection Integrity
    if len(learnings.split()) > 15:
        score += 15
    if len(failures.split()) > 10:
        score += 15

    # 4. Theory-to-Practice Synthesis
    if len(theory.split()) > 15:
        score += 20

    if score >= 90:
        return "A"
    if score >= 70:
        return "B"
    if score >= 50:
        return "C"
    return "F"


def log_today() -> None:
    """Prompts for daily inputs and saves the graded execution."""
    print(f"\n--- System Initialization: {datetime.now().strftime('%Y-%m-%d')} ---")

    try:
        code_hours = float(input("Deep Work Coding Hours: "))
        study_hours = float(input("Academic Study Hours (PTIT Coursework): "))
    except ValueError:
        print("Invalid input. Halting.")
        return

    learnings = input("\nWhat did you specifically learn today? ")
    failures = input("What system, bug, or concept defeated you today? ")
    theory = input(
        "How does today's theory (e.g., Signal Processing, Z-Transforms) apply to your engineering/trading goals? "
    )

    grade = calculate_grade(code_hours, study_hours, learnings, failures, theory)
    print(f"\n>>> SYSTEM GRADE FOR TODAY: {grade} <<<")

    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute(
        "INSERT OR REPLACE INTO daily_log VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            datetime.now().strftime("%Y-%m-%d"),
            code_hours,
            study_hours,
            learnings,
            failures,
            theory,
            grade,
        ),
    )
    conn.commit()
    conn.close()
    print("Log committed to database.")


def update_degree() -> None:
    """Visualizes progress toward graduation."""
    try:
        earned = int(
            input(f"\nEnter total credits earned so far (out of {TOTAL_CREDITS}): ")
        )
    except ValueError:
        print("Invalid input for credits.")
        return

    percentage = (earned / TOTAL_CREDITS) * 100

    print("\n--- Academic Progress ---")
    bar_filled = int(percentage / 2)
    bar = f"[{'#' * bar_filled}{'-' * (50 - bar_filled)}] {percentage:.1f}%"
    print(bar)
    print(f"Credits Remaining: {TOTAL_CREDITS - earned}\n")

    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute(
        "INSERT INTO degree_progress VALUES (?, ?, ?)",
        (datetime.now().strftime("%Y-%m-%d"), earned, TOTAL_CREDITS),
    )
    conn.commit()
    conn.close()


def main() -> None:
    init_db()
    while True:
        print("\n=== LIFE ENGINE CLI ===")
        print("1. Log Today's Execution")
        print("2. Update Degree Progress")
        print("3. Exit")

        choice = input("Select operation: ")

        if choice == "1":
            log_today()
        elif choice == "2":
            update_degree()
        elif choice == "3":
            break
        else:
            print("Invalid command.")


if __name__ == "__main__":
    main()

