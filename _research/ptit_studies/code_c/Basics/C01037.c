/*
 * Filename: C01037.c
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
    if (a > b)
    {
        int tmp = a;
        a = b;
        b = tmp;
    }
    printf("%lld", (long long)(a + b) * (b - a + 1) / 2); // Print result
    return 0;
}