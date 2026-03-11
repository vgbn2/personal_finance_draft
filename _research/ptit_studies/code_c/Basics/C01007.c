/*
 * Filename: C01007.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Entry point
int main()
{
    int a, b;
    scanf("%d %d", &a, &b); // Read input
    printf("%d\n", a + b); // Print result
    printf("%d\n", a - b); // Print result
    printf("%lld\n", (long long)a * b); // Print result
    printf("%d\n", a / b); // Print result
    printf("%d\n", a % b); // Print result
    printf("%.2f", (float)a / b); // Print result
    return 0;
}