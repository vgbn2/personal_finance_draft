/*
 * Filename: C01056.c
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
#include <stdbool.h>

bool check(long long n)
{
    int d = n % 10;
    n /= 10;
    while (n > 0)
    {
        if (n % 10 > d)
            return 0;
        d = n % 10;
        n /= 10;
    }
    return 1;
}

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    while (T--)
    {
        long long n;
        scanf("%lld", &n); // Read input
        if (check(n))
            printf("YES\n"); // Print result
        else
            printf("NO\n"); // Print result
    }
    return 0;
}