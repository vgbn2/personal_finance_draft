/*
 * Filename: C03022.c
 * Description: Checks for prime numbers
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

bool sum(int n)
{
    int s = 0;
    while (n > 0)
    {
        s += n % 10;
        n /= 10;
    }
    if (s % 5 == 0)
        return 1;
    else
        return 0;
}

bool prime(int n)
{
    if (n <= 1)
        return 0;
    for (int i = 2; i <= sqrt(n); i++)
        if (n % i == 0)
            return 0;
    return 1;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int dem = 0;
    for (int i = 1; i <= n; i++)
        if (sum(i) == 1 && prime(i) == 1)
        {
            printf("%d ", i); // Print result
            dem++;
        }
    printf("\n%d", dem); // Print result
    return 0;
}