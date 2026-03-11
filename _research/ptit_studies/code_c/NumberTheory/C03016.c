/*
 * Filename: C03016.c
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
#include <stdbool.h>

bool check(long long n)
{
    if (n == 0 || n == 1)
        return 1;
    long long f1 = 0, f2 = 1;
    long long fibo = f1 + f2;
    while (fibo < n)
    {
        fibo = f1 + f2;
        f1 = f2;
        f2 = fibo;
    }
    if (fibo == n)
        return 1;
    return 0;
}

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
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