/*
 * Filename: C01004.c
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
    int T;
    scanf("%d", &T); // Read input
    while (T--)
    {
        long long n;
        scanf("%lld", &n); // Read input
        printf("%.15lf\n", (double)1 / n); // Print result
    }
    return 0;
}