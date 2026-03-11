/*
 * Filename: C03004.c
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
    return (long long)a * b / ucln(a, b);
}

// Entry point
int main()
{
    int a, b;
    scanf("%d %d", &a, &b); // Read input
    printf("%d\n%lld", ucln(a, b), bcnn(a, b)); // Print result
    return 0;
}