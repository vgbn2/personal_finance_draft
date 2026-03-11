/*
 * Filename: C01008.c
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
    long long a, b;
    scanf("%lld %lld", &a, &b); // Read input
    if (a <= 0 || b <= 0)
    {
        printf("0"); // Print result
        return 0;
    }
    printf("%lld %lld", (a + b) * 2, a * b); // Print result
    return 0;
}