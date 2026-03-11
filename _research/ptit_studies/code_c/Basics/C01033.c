/*
 * Filename: C01033.c
 * Description: C Program using functions: ThuanNghich
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

long long ThuanNghich(long long n)
{
    long long res = 0;
    while (n > 0)
    {
        res = res * 10 + n % 10;
        n /= 10;
    }
    return res;
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
        if (n == ThuanNghich(n))
            printf("YES\n"); // Print result
        else
            printf("NO\n"); // Print result
    }
    return 0;
}