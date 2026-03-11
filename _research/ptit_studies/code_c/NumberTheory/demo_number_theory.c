/*
 * Filename: demo_number_theory.c
 * Description: Checks for prime numbers using functions: is_prime
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */


// Import standard libraries
#include <stdio.h>

int is_prime(int n) {
    if(n < 2) return 0;
    for(int i=2; i*i<=n; i++) {
        if(n%i == 0) return 0;
    }
    return 1;
}

void main() {
    int n;
    printf("\n=== Interactive Demo: Number Theory ===\n"); // Print result
    printf("Enter a number to analyze: "); // Print result
    scanf("%d", &n); // Read input
    
    if(is_prime(n)) printf("%d is a Prime number.\n", n); // Print result
    else printf("%d is NOT Prime.\n", n); // Print result
    
    printf("Prime Factors: "); // Print result
    int temp = n;
    for(int i=2; i*i<=temp; i++) {
        if(temp % i == 0) {
            printf("%d ", i); // Print result
            while(temp % i == 0) temp /= i;
        }
    }
    if(temp > 1) printf("%d", temp); // Print result
    printf("\n"); // Print result
}
