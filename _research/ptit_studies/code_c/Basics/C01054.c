/*
 * Filename: C01054.c
 * Description: Calculates sums using functions: eratosthenes, SUM
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#define lmt 2000000 // lmt: limit

int a[lmt + 1] = {0};
void eratosthenes()
{
    for (int i = 2; i * i <= lmt; i++)
        if (a[i] == 0)
            for (int j = i * i; j <= lmt; j += i)
                if (a[j] == 0)
                    a[j] = i;
    for (int i = 2; i <= lmt; i++)
        if (a[i] == 0)
            a[i] = i;
}

int SUM(int n)
{
    int s = 0;
    while (n != 1)
    {
        s += a[n];
        n /= a[n];
    }
    return s;
}

// Entry point
int main()
{
    eratosthenes();
    int n;
    scanf("%d", &n); // Read input
    long long sum = 0;
    while (n--)
    {
        int x;
        scanf("%d", &x); // Read input
        sum += SUM(x);
    }
    printf("%lld", sum); // Print result
    return 0;
}