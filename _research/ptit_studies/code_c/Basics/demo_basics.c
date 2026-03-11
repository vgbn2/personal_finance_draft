/*
 * Filename: demo_basics.c
 * Description: Calculates sums
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */


// Import standard libraries
#include <stdio.h>

void main() {
    int choice;
    printf("\n=== Interactive Demo: C Basics ===\n"); // Print result
    printf("1. Check Odd/Even\n"); // Print result
    printf("2. Sum 1 to N\n"); // Print result
    printf("3. Basic Calculator\n"); // Print result
    printf("0. Exit\n"); // Print result
    
    printf("Enter choice: "); // Print result
    scanf("%d", &choice); // Read input

    if(choice == 1) {
        int n;
        printf("Enter a number: "); // Print result
        scanf("%d", &n); // Read input
        if(n % 2 == 0) printf("%d is Even.\n", n); // Print result
        else printf("%d is Odd.\n", n); // Print result
    } 
    else if(choice == 2) {
        int n;
        long long sum = 0;
        printf("Enter N: "); // Print result
        scanf("%d", &n); // Read input
        for(int i=1; i<=n; i++) sum += i;
        printf("Sum from 1 to %d is %lld\n", n, sum); // Print result
    }
    else if(choice == 3) {
        double a, b;
        char op;
        printf("Enter expression (e.g., 5 + 3): "); // Print result
        scanf("%lf %c %lf", &a, &op, &b); // Read input
        if(op == '+') printf("Result: %.2lf\n", a+b); // Print result
        else if(op == '-') printf("Result: %.2lf\n", a-b); // Print result
        else if(op == '*') printf("Result: %.2lf\n", a*b); // Print result
        else if(op == '/') {
            if(b!=0) printf("Result: %.2lf\n", a/b); // Print result
            else printf("Error: Division by zero\n"); // Print result
        }
        else printf("Invalid operator.\n"); // Print result
    }
    
    printf("\nDemo finished.\n"); // Print result
}
