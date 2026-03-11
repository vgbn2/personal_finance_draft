/*
 * Filename: C03014.c
 * Description: C Program using functions: ucln, bcnn
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

int ucln(int a, int b)
{
    while (b > 0)
    {
        int x = a % b;
        a = b;
        b = x;
    }
    return a;
}

long long bcnn(int a, int b)
{
    return (long long)a * b / (ucln(a, b));
}

// Entry point
int main()
{
    int T;
    scanf("%d", &T); // Read input
    while (T--)
    {
        int a, b;
        scanf("%d %d", &a, &b); // Read input
        printf("%lld %d\n", bcnn(a, b), ucln(a, b)); // Print result
    }
}