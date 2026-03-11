/*
 * Filename: C04004.c
 * Description: C Program using functions: fibo
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

long long fibo(int n)
{
    if (n == 1 || n == 2)
        return 1;
    long long f1 = 1, f2 = 1, f;
    for (int i = 3; i <= n; i++)
    {
        f = f1 + f2;
        f1 = f2;
        f2 = f;
    }
    return f;
}

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    while (T--)
    {
        int n;
        scanf("%d", &n); // Read input
        printf("%lld\n", fibo(n)); // Print result
    }
    return 0;
}