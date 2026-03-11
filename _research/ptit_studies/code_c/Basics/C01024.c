/*
 * Filename: C01024.c
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
        int n;
        scanf("%d", &n); // Read input
        int cuoi = n % 10;
        while (n > 10)
            n /= 10;
        if (n == cuoi)
            printf("YES\n"); // Print result
        else
            printf("NO\n"); // Print result
    }
    return 0;
}