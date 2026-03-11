/*
 * Filename: C01018.c
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
#include <math.h>

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    while (T--)
    {
        long long n;
        scanf("%lld", &n); // Read input
        int x = sqrt(n);
        if (x * x == n)
            printf("YES\n"); // Print result
        else
            printf("NO\n"); // Print result
    }
    return 0;
}